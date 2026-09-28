import { useEffect, useRef, useState } from 'react';
import { request } from '../lib/api';
import { t } from '../locales';
import type { PointCaptcha as Challenge, CaptchaPoint } from '../lib/types';
import { Icon } from './UI';
export function ServerSlider({
  username,
  purpose,
  proof,
  onProof,
  resetKey,
}: {
  username: string;
  purpose: 'login' | 'register';
  proof: string;
  onProof: (v: string) => void;
  resetKey: number;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const drag = useRef({
    active: false,
    start: 0,
    time: 0,
    width: 0,
    pos: 0,
    generation: 0,
    tracks: [] as { x: number; t: number }[],
    challenge: null as Promise<{ captcha_id: string }> | null,
  });
  function reset() {
    drag.current.generation++;
    drag.current.active = false;
    setPosition(0);
    setBusy(false);
    setError('');
    onProof('');
  }
  useEffect(() => {
    reset();
    return () => {
      drag.current.generation++;
    };
  }, [username, purpose, resetKey]);
  async function end() {
    const d = drag.current;
    if (!d.active) return;
    d.active = false;
    if (d.pos < d.width - 2 || !d.challenge || d.width <= 0) {
      reset();
      setError(t('app.captcha.sliderIncomplete'));
      return;
    }
    const generation = d.generation;
    setBusy(true);
    const duration = Math.round(performance.now() - d.time);
    const tracks = [...d.tracks, { x: Math.round(d.width), t: duration }];
    try {
      const challenge = await d.challenge;
      const result = await request<{ proof: string }>('/auth/pub/slider/verify', {
        method: 'POST',
        public: true,
        body: {
          captcha_id: challenge.captcha_id,
          distance: Math.round(d.width),
          width: Math.round(d.width),
          duration_ms: duration,
          tracks,
          purpose,
          username: username.trim(),
        },
      });
      if (generation === d.generation) onProof(result.proof);
    } catch {
      if (generation === d.generation) {
        setPosition(0);
        setError(t('app.captcha.sliderFailed'));
      }
    } finally {
      if (generation === d.generation) setBusy(false);
    }
  }
  return (
    <div>
      <div ref={track} className={`slider-track ${proof ? 'verified' : ''}`} aria-busy={busy}>
        <span>{t(busy ? 'app.captcha.checking' : proof ? 'app.captcha.passed' : 'slider')}</span>
        <button
          type="button"
          className="slider-handle"
          name="captcha-action"
          aria-label={t('sliderHandle')}
          disabled={busy || !!proof || !username.trim()}
          style={{ transform: `translateX(${position}px)` }}
          onPointerDown={(e) => {
            reset();
            const d = drag.current;
            d.start = e.clientX;
            d.time = performance.now();
            d.width = Math.max(0, (track.current?.clientWidth || 0) - 52);
            d.pos = 0;
            d.tracks = [{ x: 0, t: 0 }];
            d.active = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            d.challenge = request('/auth/pub/slider/challenge', {
              method: 'POST',
              public: true,
              body: { purpose, username: username.trim() },
            });
            void d.challenge.catch(() => {});
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d.active) return;
            d.pos = Math.min(d.width, Math.max(0, e.clientX - d.start));
            setPosition(d.pos);
            if (d.tracks.length < 127)
              d.tracks.push({ x: Math.round(d.pos), t: Math.round(performance.now() - d.time) });
          }}
          onPointerUp={() => void end()}
          onPointerCancel={reset}
        >
          <Icon name={proof ? 'check' : 'chevron-right-double'} />
        </button>
      </div>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
export function PointCaptcha({
  captcha,
  onCaptcha,
  points,
  onPoints,
  username,
  authenticated = false,
}: {
  captcha: Challenge;
  onCaptcha: (v: Challenge) => void;
  points: CaptchaPoint[];
  onPoints: (p: CaptchaPoint[]) => void;
  username?: string;
  authenticated?: boolean;
}) {
  const [selected, setSelected] = useState<CaptchaPoint[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const image = useRef<HTMLImageElement>(null);
  const generation = useRef(0);
  const path = authenticated ? '/auth/captcha' : '/auth/pub/captcha';
  useEffect(() => {
    generation.current++;
    setSelected([]);
    onPoints([]);
    setBusy(false);
    return () => {
      generation.current++;
    };
  }, [captcha.captcha_id]);
  async function refresh() {
    setBusy(true);
    setError('');
    onPoints([]);
    setSelected([]);
    try {
      onCaptcha(
        await request<Challenge>(path, {
          method: 'POST',
          public: !authenticated,
          body: { captcha_id: captcha.captcha_id },
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function select(x: number, y: number) {
    if (busy || points.length) return;
    const at = selected.findIndex((q) => (q.x - x) ** 2 + (q.y - y) ** 2 <= 196);
    if (at >= 0) {
      setSelected(selected.filter((_, i) => i !== at));
      return;
    }
    const next = [...selected, { x, y }];
    setSelected(next);
    if (next.length < captcha.target_count) return;
    setBusy(true);
    setError('');
    const current = generation.current;
    try {
      const result = await request<{ verified: boolean; captcha?: Challenge }>(`${path}/verify`, {
        method: 'POST',
        public: !authenticated,
        body: {
          captcha_id: captcha.captcha_id,
          captcha_points: next,
          ...(!authenticated ? { username } : {}),
        },
      });
      if (current !== generation.current) return;
      if (result.verified) onPoints(next);
      else {
        setSelected([]);
        if (result.captcha) onCaptcha(result.captcha);
        setError(t('app.captcha.failed'));
      }
    } catch (e) {
      if (current === generation.current) {
        setSelected([]);
        setError((e as Error).message);
      }
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }
  return (
    <div className="point-captcha" aria-busy={busy}>
      <div className="section-heading">
        <span>{captcha.hint_text}</span>
        <button type="button" disabled={busy} onClick={() => void refresh()}>
          {t('refreshCaptcha')}
        </button>
      </div>
      <div
        className="captcha-image"
        onClick={(e) => {
          const box = image.current?.getBoundingClientRect();
          if (box)
            void select(
              Math.round(((e.clientX - box.left) / box.width) * captcha.width),
              Math.round(((e.clientY - box.top) / box.height) * captcha.height),
            );
        }}
      >
        <img ref={image} src={captcha.captcha_image} alt={t('captchaAlt')} />
        {selected.map((p, i) => (
          <span
            key={i}
            className="captcha-point"
            style={{
              left: `${(p.x / captcha.width) * 100}%`,
              top: `${(p.y / captcha.height) * 100}%`,
            }}
          >
            {i + 1}
          </span>
        ))}
      </div>
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
      {points.length > 0 && <p className="success-text">{t('app.captcha.passed')}</p>}
    </div>
  );
}
