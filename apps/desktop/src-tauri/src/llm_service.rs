//! The LLM side of the app as one owner: the provider behind its port, the
//! model catalogue and the per-chat cancellation registry.
//!
//! The three used to be three separate fields of `App` (`llm`, `models`,
//! `llm_cancel`) that only ever moved together — swapping the provider on a key
//! change had to hand it the same catalogue Arc, and the registry is meaningless
//! without the provider whose streams it cancels.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use tokio_util::sync::CancellationToken;

use crate::llm;
use crate::sync::MutexExt;

/// A superseded stream keeps running until its provider future observes the cancel, and
/// on the way out it drains its buffer, emits a result and clears its registry entry.
/// Without an epoch all three land on the stream that replaced it: its answer gets the
/// old tail prepended, `llm-done` tears it down mid-flight, and its cancel token is
/// dropped from the map so Stop no longer reaches it.
pub struct LlmStreamSlot {
    epoch: u64,
    cancel: CancellationToken,
}

pub type LlmStreamSlots = HashMap<String, LlmStreamSlot>;

fn claim_slot(slots: &mut LlmStreamSlots, chat_id: &str, epoch: u64, cancel: CancellationToken) {
    let slot = LlmStreamSlot { epoch, cancel };
    if let Some(old) = slots.insert(chat_id.to_string(), slot) {
        old.cancel.cancel();
    }
}

fn slot_is_current(slots: &LlmStreamSlots, chat_id: &str, epoch: u64) -> bool {
    slots.get(chat_id).is_some_and(|slot| slot.epoch == epoch)
}

fn release_slot(slots: &mut LlmStreamSlots, chat_id: &str, epoch: u64) {
    if slot_is_current(slots, chat_id, epoch) {
        slots.remove(chat_id);
    }
}

pub struct LlmService {
    provider: Mutex<Arc<dyn llm::LlmProvider>>,
    /// The same `Arc` the provider resolves capabilities through — `list_models`
    /// refreshes it in place, so handing a rebuilt provider a fresh catalogue
    /// would silently forget every model the app had already learned about.
    catalog: llm::ModelCatalog,
    slots: Mutex<LlmStreamSlots>,
    /// Monotonic across every chat: two chats may not share an epoch, so a stale
    /// task can never mistake itself for the live stream of another chat.
    epoch: AtomicU64,
}

impl LlmService {
    pub fn new(provider: Arc<dyn llm::LlmProvider>, catalog: llm::ModelCatalog) -> Self {
        Self {
            provider: Mutex::new(provider),
            catalog,
            slots: Mutex::new(LlmStreamSlots::new()),
            epoch: AtomicU64::new(0),
        }
    }

    /// Cloned out of the state on purpose: the clone shares the connection
    /// pool's `Arc`, and holding a `MutexGuard` across an `.await` would not.
    pub fn provider(&self) -> Arc<dyn llm::LlmProvider> {
        Arc::clone(&*self.provider.lock_safe())
    }

    pub fn catalog(&self) -> llm::ModelCatalog {
        Arc::clone(&self.catalog)
    }

    /// The models the app already knows about — the answer `list_models` falls
    /// back to when the network call comes back empty.
    pub fn cached_models(&self) -> Vec<llm::ModelInfo> {
        self.catalog.lock_safe().clone()
    }

    /// A key or access token changed: the provider is rebuilt around the same
    /// catalogue.
    pub fn replace_provider(&self, provider: Arc<dyn llm::LlmProvider>) {
        *self.provider.lock_safe() = provider;
    }

    /// Registers a new stream for `chat_id`, cancelling whatever it replaces.
    pub fn begin_stream(&self, chat_id: &str) -> (u64, CancellationToken) {
        let epoch = self.epoch.fetch_add(1, Ordering::AcqRel) + 1;
        let cancel = CancellationToken::new();
        claim_slot(&mut self.slots.lock_safe(), chat_id, epoch, cancel.clone());
        (epoch, cancel)
    }

    /// Whether this epoch is still the live stream of that chat. Every emit on
    /// the stream path asks first — a superseded task must stay silent.
    pub fn is_current_stream(&self, chat_id: &str, epoch: u64) -> bool {
        slot_is_current(&self.slots.lock_safe(), chat_id, epoch)
    }

    /// Clears the slot, but only if it is still ours: an outgoing task that
    /// evicted the live stream would take Stop away from it.
    pub fn end_stream(&self, chat_id: &str, epoch: u64) {
        release_slot(&mut self.slots.lock_safe(), chat_id, epoch);
    }

    /// The Stop button.
    pub fn cancel_stream(&self, chat_id: &str) {
        if let Some(slot) = self.slots.lock_safe().remove(chat_id) {
            slot.cancel.cancel();
        }
    }
}

#[cfg(test)]
mod tests;
