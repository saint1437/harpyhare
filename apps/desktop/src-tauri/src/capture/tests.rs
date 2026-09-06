use super::*;

fn shared() -> Arc<Shared> {
    Arc::new(Shared {
        shutdown: AtomicBool::new(false),
        recording: AtomicBool::new(false),
        buffering: AtomicBool::new(false),
        stop_requested: AtomicBool::new(false),
        produced: AtomicU64::new(0),
        dropped: AtomicU64::new(0),
        sample_rate: audio::TARGET_SAMPLE_RATE,
        channels: 1,
        session: Mutex::new(Session::Idle),
        rolling: Mutex::new(audio::RollingBuffer::new(0)),
        cv: Condvar::new(),
    })
}

#[test]
fn consumer_exits_after_shutdown_instead_of_leaking_per_recording() {
    for buffering in [false, true] {
        let shared = shared();
        shared.buffering.store(buffering, Ordering::Release);
        let (_prod, cons) = HeapRb::<f32>::new(1024).split();
        let (done_tx, done_rx) = std::sync::mpsc::channel();
        let worker_shared = Arc::clone(&shared);
        let worker = std::thread::spawn(move || {
            consumer_main(&worker_shared, cons);
            done_tx.send(()).unwrap();
        });
        {
            let _session = shared.session.lock().unwrap();
            shared.shutdown.store(true, Ordering::Release);
            shared.buffering.store(false, Ordering::Release);
            shared.stop_requested.store(true, Ordering::Release);
            shared.cv.notify_all();
        }
        done_rx
            .recv_timeout(Duration::from_secs(2))
            .expect("consumer must exit");
        worker.join().unwrap();
    }
}

#[test]
fn shutdown_takes_precedence_over_pending_session() {
    let shared = shared();
    *shared.session.lock().unwrap() = Session::Start(None);
    shared.shutdown.store(true, Ordering::Release);
    assert!(matches!(wait_for_work(&shared), ConsumerWork::Shutdown));
}
