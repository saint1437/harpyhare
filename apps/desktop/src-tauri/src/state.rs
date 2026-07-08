pub const MIN_RECORDING_SECS: f32 = 0.3;
pub const MAX_RECORDING_SECS: f32 = 600.0;

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum RecorderState {
    Idle,
    Recording,
    Transcribing,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Event {
    PttPressed,
    PttReleased { duration_secs: f32 },
    Cancel,
    MaxDurationReached,
    TranscriptionFinished,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Action {
    None,
    StartCapture,
    Transcribe,
    Discard,
}

impl RecorderState {
    pub fn on(&mut self, e: Event) -> Action {
        use Action as A;
        use Event as E;
        use RecorderState as S;
        let (next, action) = match (*self, e) {
            (S::Idle, E::PttPressed) => (S::Recording, A::StartCapture),
            (S::Recording, E::PttReleased { duration_secs }) if duration_secs < MIN_RECORDING_SECS => {
                (S::Idle, A::Discard)
            }
            (S::Recording, E::PttReleased { .. }) => (S::Transcribing, A::Transcribe),
            (S::Recording, E::MaxDurationReached) => (S::Transcribing, A::Transcribe),
            (S::Recording, E::Cancel) => (S::Idle, A::Discard),
            (S::Transcribing, E::TranscriptionFinished) => (S::Idle, A::None),
            (s, _) => (s, A::None),
        };
        *self = next;
        action
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn happy_path() {
        let mut m = RecorderState::Idle;
        assert_eq!(m.on(Event::PttPressed), Action::StartCapture);
        assert_eq!(m, RecorderState::Recording);
        assert_eq!(m.on(Event::PttReleased { duration_secs: 2.0 }), Action::Transcribe);
        assert_eq!(m, RecorderState::Transcribing);
        assert_eq!(m.on(Event::TranscriptionFinished), Action::None);
        assert_eq!(m, RecorderState::Idle);
    }

    #[test]
    fn too_short_recording_is_discarded() {
        let mut m = RecorderState::Recording;
        assert_eq!(m.on(Event::PttReleased { duration_secs: 0.2 }), Action::Discard);
        assert_eq!(m, RecorderState::Idle);
    }

    #[test]
    fn press_ignored_while_transcribing() {
        let mut m = RecorderState::Transcribing;
        assert_eq!(m.on(Event::PttPressed), Action::None);
        assert_eq!(m, RecorderState::Transcribing);
    }

    #[test]
    fn esc_cancels_only_recording() {
        let mut m = RecorderState::Recording;
        assert_eq!(m.on(Event::Cancel), Action::Discard);
        assert_eq!(m, RecorderState::Idle);
        let mut idle = RecorderState::Idle;
        assert_eq!(idle.on(Event::Cancel), Action::None);
    }

    #[test]
    fn max_duration_forces_transcription() {
        let mut m = RecorderState::Recording;
        assert_eq!(m.on(Event::MaxDurationReached), Action::Transcribe);
        assert_eq!(m, RecorderState::Transcribing);
    }
}
