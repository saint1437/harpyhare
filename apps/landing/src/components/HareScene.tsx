export function HareScene() {
  return (
    <div className="hare-scene" aria-hidden>
      <img src="./hare/bush-back.png" alt="" className="hare-bush-back" />
      <div className="hare-runner">
        <div className="hare-hop">
          <div className="hare-squash">
            <img src="./hare/hare-gather.png" alt="" className="hare-pose hare-pose-gather" />
            <img src="./hare/hare-leap.png" alt="" className="hare-pose hare-pose-leap" />
            <img src="./hare/hare-dive.png" alt="" className="hare-pose hare-pose-dive" />
          </div>
        </div>
      </div>
      <div className="hare-peek">
        <img src="./hare/hare-front.png" alt="" className="hare-pose hare-peek-front" />
        <img src="./hare/hare-front-ear.png" alt="" className="hare-pose hare-peek-ear" />
      </div>
      <img src="./hare/hare-sit.png" alt="" className="hare-static" />
      <img src="./hare/bush-front.png" alt="" className="hare-bush-front" />
    </div>
  );
}
