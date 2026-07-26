export function HareScene() {
  return (
    <div className="hare-scene" aria-hidden>
      <img
        loading="lazy"
        decoding="async"
        src="/hare/bush-back.png"
        alt=""
        className="hare-bush-back"
      />
      <div className="hare-runner">
        <div className="hare-hop">
          <div className="hare-squash">
            <img
              loading="lazy"
              decoding="async"
              src="/hare/hare-gather.png"
              alt=""
              className="hare-pose hare-pose-gather"
            />
            <img
              loading="lazy"
              decoding="async"
              src="/hare/hare-leap.png"
              alt=""
              className="hare-pose hare-pose-leap"
            />
            <img
              loading="lazy"
              decoding="async"
              src="/hare/hare-dive.png"
              alt=""
              className="hare-pose hare-pose-dive"
            />
          </div>
        </div>
      </div>
      <div className="hare-peek">
        <img
          loading="lazy"
          decoding="async"
          src="/hare/hare-front.png"
          alt=""
          className="hare-pose hare-peek-front"
        />
        <img
          loading="lazy"
          decoding="async"
          src="/hare/hare-front-ear.png"
          alt=""
          className="hare-pose hare-peek-ear"
        />
      </div>
      <img
        loading="lazy"
        decoding="async"
        src="/hare/hare-sit.png"
        alt=""
        className="hare-static"
      />
      <img
        loading="lazy"
        decoding="async"
        src="/hare/bush-front.png"
        alt=""
        className="hare-bush-front"
      />
    </div>
  );
}
