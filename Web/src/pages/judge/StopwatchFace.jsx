/**
 * The Time Keeper's stopwatch face — after Apple's analog stopwatch, fitted to
 * a Mallakhamb routine.
 *
 *   Main dial   one turn = 60 s, quarter-second ticks, 5…60 numerals, an
 *               orange sweep hand with a counterweight tail.
 *   Sub-dial    one turn = 120 s. Its rim marks the deduction-free window —
 *               green from 60 (single beep) to 90 (double beep) — with amber
 *               before it (too short: a deduction if stopped there) and red
 *               after it (over time). Where the athlete stands is readable at
 *               a glance — the part Apple spends on minutes.
 *   Readout     whole seconds only (…59, 60, 61…), as the time is recorded.
 *
 * SMOOTHNESS. Both hands are turned from `requestAnimationFrame`, writing the
 * SVG transform directly — React re-renders once a second (the readout), never
 * sixty times a second. The hand's angle comes from the clock, not from frame
 * counting, so it stays exact on a throttled or slow device. On Reset the hands
 * spring home instead of jumping.
 *
 * Buttons follow the stopwatch convention: the right button runs the clock
 * (Start → Pause → Resume), the left one ends it (Stop) or clears it (Reset).
 */
import { useEffect, useMemo, useRef } from 'react';
import PropTypes from 'prop-types';
import { BEEP_MARKS } from './timeKeeper';

const SIZE = 320;
const C = SIZE / 2;
const ORANGE = '#FF9F0A';
const SUB = { cx: C, cy: 102, r: 40 }; // sub-dial centre and radius
const SUB_SPAN = 120; // seconds per turn of the sub-dial

const polar = (cx, cy, r, deg) => {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
};

/** An SVG arc path along a circle, between two angles in degrees. */
const arcPath = (cx, cy, r, fromDeg, toDeg) => {
  const [x1, y1] = polar(cx, cy, r, fromDeg);
  const [x2, y2] = polar(cx, cy, r, toDeg);
  const large = toDeg - fromDeg > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
};

/** The static face: drawn once, never re-rendered by the running clock. */
const Face = () => {
  const ticks = useMemo(() => Array.from({ length: 240 }, (_, i) => {
    const deg = i * 1.5; // a quarter second
    const major = i % 20 === 0; // every 5 s
    const second = i % 4 === 0;
    const len = major ? 15 : second ? 10 : 6;
    const [x1, y1] = polar(C, C, 150, deg);
    const [x2, y2] = polar(C, C, 150 - len, deg);
    return (
      <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
        stroke={major ? '#FFFFFF' : second ? '#BDBDBD' : '#5A5A5A'}
        strokeWidth={major ? 2.2 : second ? 1.3 : 0.8} strokeLinecap="round" />
    );
  }), []);

  const numerals = useMemo(() => Array.from({ length: 12 }, (_, i) => {
    const value = (i + 1) * 5;
    const [x, y] = polar(C, C, 119, value * 6);
    return (
      <text key={value} x={x} y={y} fill="#FFFFFF" fontSize="18" fontWeight="400"
        textAnchor="middle" dominantBaseline="central"
        style={{ fontFeatureSettings: '"tnum"', letterSpacing: '-0.02em' }}>
        {value}
      </text>
    );
  }), []);

  const deg = (s) => (s / SUB_SPAN) * 360;
  const [beep, doubleBeep] = BEEP_MARKS;

  return (
    <g>
      <circle cx={C} cy={C} r={158} fill="url(#sw-face)" />
      <circle cx={C} cy={C} r={158} fill="none" stroke="#1C1C1E" strokeWidth="2" />
      {ticks}
      {numerals}

      {/* Sub-dial: one turn is 120 s, shaded from the first beep onward */}
      <circle cx={SUB.cx} cy={SUB.cy} r={SUB.r} fill="#0B0B0C" stroke="#2C2C2E" strokeWidth="1" />
      {/* Too short / the deduction-free window / over time */}
      <path d={arcPath(SUB.cx, SUB.cy, SUB.r - 3, 1, deg(beep.at))}
        stroke="#FFD60A" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.55" />
      <path d={arcPath(SUB.cx, SUB.cy, SUB.r - 3, deg(beep.at), deg(doubleBeep.at))}
        stroke="#30D158" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.95" />
      <path d={arcPath(SUB.cx, SUB.cy, SUB.r - 3, deg(doubleBeep.at), 359)}
        stroke="#FF453A" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.9" />
      {Array.from({ length: 24 }, (_, i) => {
        const d = i * 15; // every 5 s
        const major = i % 6 === 0; // every 30 s
        const [x1, y1] = polar(SUB.cx, SUB.cy, SUB.r - 7, d);
        const [x2, y2] = polar(SUB.cx, SUB.cy, SUB.r - (major ? 12 : 9), d);
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={major ? '#E5E5E7' : '#6C6C70'} strokeWidth={major ? 1.2 : 0.7} />;
      })}
      {[['0', 0], ['30', 90], ['60', 180], ['90', 270]].map(([label, d]) => {
        const [x, y] = polar(SUB.cx, SUB.cy, SUB.r - 21, d);
        return (
          <text key={label} x={x} y={y} fill="#AEAEB2" fontSize="8.5" fontWeight="600"
            textAnchor="middle" dominantBaseline="central">{label}</text>
        );
      })}
    </g>
  );
};

/** A round stopwatch button, with the thin separated ring of the original. */
const RoundButton = ({ label, tone, onClick, disabled }) => {
  const tones = {
    gray: { bg: '#333336', fg: '#FFFFFF' },
    green: { bg: 'rgba(48,209,88,0.22)', fg: '#30D158' },
    red: { bg: 'rgba(255,69,58,0.22)', fg: '#FF453A' },
    amber: { bg: 'rgba(255,159,10,0.22)', fg: ORANGE },
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      /* Plain CSS, not an animation library: the colour and the press are
         applied the instant the state changes, on any device, and the press
         scale is a compositor-only transform. */
      className="relative w-[84px] h-[84px] rounded-full flex items-center justify-center select-none
        transition-[transform,background-color,color,box-shadow] duration-150 ease-out
        enabled:active:scale-[0.92] disabled:cursor-not-allowed"
      style={{
        background: tones.bg,
        color: disabled ? 'rgba(255,255,255,0.28)' : tones.fg,
        boxShadow: `0 0 0 2.5px #000, 0 0 0 4.5px ${tones.bg}`,
        opacity: disabled ? 0.55 : 1,
        WebkitTapHighlightColor: 'transparent',
        touchAction: 'manipulation',
      }}
    >
      {/* The label changes instantly, as on the original — a cross-fade makes
          the Time Keeper wait to read what the button now does. */}
      <span className="text-[15px] font-medium">{label}</span>
    </button>
  );
};

RoundButton.propTypes = {
  label: PropTypes.string.isRequired,
  tone: PropTypes.oneOf(['gray', 'green', 'red', 'amber']).isRequired,
  onClick: PropTypes.func,
  disabled: PropTypes.bool,
};

/**
 * @param {Object} props
 * @param {ReturnType<import('./timeKeeper').useTimekeeping>} props.watch
 * @param {string} [props.title] - athlete being timed
 * @param {string} [props.subtitle] - apparatus
 * @param {boolean} [props.canStart]
 * @param {Function} props.onStop - (seconds) => void, called once on Stop
 * @param {Function} [props.onNext] - after a stop: clear and move on
 * @param {React.ReactNode} [props.footer] - status line under the buttons
 */
const StopwatchFace = ({ watch, title, subtitle, canStart = true, onStop, onNext, footer }) => {
  const handRef = useRef(null);
  const subHandRef = useRef(null);
  const angleRef = useRef(0);

  const { status, seconds, elapsedMs } = watch;

  // Drive both hands. Running: every frame from the clock. Otherwise: set once
  // — or, on a reset, spring back to 60 over a quarter second.
  useEffect(() => {
    const draw = (ms) => {
      const main = ((ms / 1000) % 60) * 6;
      const sub = ((ms / 1000) % SUB_SPAN) * (360 / SUB_SPAN);
      angleRef.current = main;
      handRef.current?.setAttribute('transform', `rotate(${main} ${C} ${C})`);
      subHandRef.current?.setAttribute('transform', `rotate(${sub} ${SUB.cx} ${SUB.cy})`);
    };

    if (status === 'running') {
      let frame;
      const loop = () => { draw(elapsedMs()); frame = requestAnimationFrame(loop); };
      frame = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(frame);
    }

    if (status === 'idle' && angleRef.current !== 0) {
      const from = angleRef.current;
      const fromSub = subHandRef.current?.transform?.baseVal?.[0]?.angle ?? 0;
      const t0 = performance.now();
      let frame;
      const ease = (t) => 1 - (1 - t) ** 3;
      const home = (now) => {
        const t = Math.min(1, (now - t0) / 260);
        const k = 1 - ease(t);
        handRef.current?.setAttribute('transform', `rotate(${from * k} ${C} ${C})`);
        subHandRef.current?.setAttribute('transform', `rotate(${fromSub * k} ${SUB.cx} ${SUB.cy})`);
        if (t < 1) frame = requestAnimationFrame(home); else angleRef.current = 0;
      };
      frame = requestAnimationFrame(home);
      return () => cancelAnimationFrame(frame);
    }

    draw(elapsedMs());
    return undefined;
  }, [status, elapsedMs]);

  const running = status === 'running';
  const paused = status === 'paused';
  const stopped = status === 'stopped';

  const handleStop = () => onStop(watch.stop());

  const left = (running || paused)
    ? { label: 'Stop', tone: 'red', onClick: handleStop }
    : { label: 'Reset', tone: 'gray', onClick: watch.reset, disabled: !stopped };
  const right = running
    ? { label: 'Pause', tone: 'amber', onClick: watch.pause }
    : paused
      ? { label: 'Resume', tone: 'green', onClick: watch.resume }
      : stopped
        ? { label: 'Next', tone: 'green', onClick: onNext || watch.reset }
        : { label: 'Start', tone: 'green', onClick: watch.start, disabled: !canStart };

  // Red when the time now costs a deduction: past 90, or stopped short of 60.
  // (Running under 60 is normal — the routine is not over yet.)
  const pastDeduction = seconds > BEEP_MARKS[1].at
    || (stopped && seconds > 0 && seconds < BEEP_MARKS[0].at);

  return (
    <div className="w-full rounded-[28px] p-4 sm:p-5 flex flex-col items-center"
      style={{ background: '#000', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)' }}>
      <div className="w-full flex items-baseline justify-between gap-3 px-1 mb-2">
        <span className="text-[17px] font-medium truncate" style={{ color: ORANGE }}>{title || 'Choose an athlete'}</span>
        {subtitle && <span className="text-[15px] text-white/50 truncate">{subtitle}</span>}
      </div>

      <div className="w-full max-w-[380px] aspect-square">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full h-full" role="img"
          aria-label={`Stopwatch at ${seconds} seconds`}>
          <defs>
            <radialGradient id="sw-face" cx="50%" cy="45%" r="60%">
              <stop offset="0%" stopColor="#121214" />
              <stop offset="100%" stopColor="#000" />
            </radialGradient>
          </defs>
          <Face />

          {/* Readout — whole seconds */}
          <text x={C} y={218} fill={pastDeduction ? '#FF453A' : '#FFFFFF'} fontSize="40" fontWeight="300"
            textAnchor="middle" dominantBaseline="central"
            style={{ fontFeatureSettings: '"tnum"', transition: 'fill 200ms ease' }}
            data-testid="timer-seconds">
            {seconds}
          </text>
          <text x={C} y={244} fill="#8E8E93" fontSize="9" fontWeight="600" letterSpacing="0.14em"
            textAnchor="middle">SECONDS</text>

          {/* Sub-dial hand */}
          <g ref={subHandRef} style={{ willChange: 'transform' }}>
            <line x1={SUB.cx} y1={SUB.cy + 5} x2={SUB.cx} y2={SUB.cy - SUB.r + 6} stroke={ORANGE} strokeWidth="1.6" strokeLinecap="round" />
          </g>
          <circle cx={SUB.cx} cy={SUB.cy} r="2.6" fill={ORANGE} />

          {/* Main sweep hand */}
          <g ref={handRef} style={{ willChange: 'transform' }}>
            <line x1={C} y1={C + 26} x2={C} y2={16} stroke={ORANGE} strokeWidth="2" strokeLinecap="round" />
          </g>
          <circle cx={C} cy={C} r="5.5" fill={ORANGE} />
          <circle cx={C} cy={C} r="2.2" fill="#000" />
        </svg>
      </div>

      <div className="w-full flex items-center justify-between mt-1 px-1">
        <RoundButton {...left} />
        <div className="flex-1 text-center px-2 text-xs text-white/45 min-h-[32px] flex items-center justify-center">
          {footer}
        </div>
        <RoundButton {...right} />
      </div>
    </div>
  );
};

StopwatchFace.propTypes = {
  watch: PropTypes.shape({
    status: PropTypes.string.isRequired,
    seconds: PropTypes.number.isRequired,
    elapsedMs: PropTypes.func.isRequired,
    start: PropTypes.func.isRequired,
    pause: PropTypes.func.isRequired,
    resume: PropTypes.func.isRequired,
    stop: PropTypes.func.isRequired,
    reset: PropTypes.func.isRequired,
  }).isRequired,
  title: PropTypes.string,
  subtitle: PropTypes.string,
  canStart: PropTypes.bool,
  onStop: PropTypes.func.isRequired,
  onNext: PropTypes.func,
  footer: PropTypes.node,
};

export default StopwatchFace;
