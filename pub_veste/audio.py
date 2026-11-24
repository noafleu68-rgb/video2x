import numpy as np, wave
SR = 44100; T = 23.0; n = int(SR * T)
t = np.arange(n) / SR
rng = np.random.default_rng(3)

def env(a, b, fade_in=0.3, fade_out=0.3):
    e = np.clip((t - a) / fade_in, 0, 1) * np.clip((b - t) / fade_out, 0, 1)
    return e

def lowpass(x, k):
    c = np.cumsum(np.concatenate([[0], x]))
    return (c[k:] - c[:-k]) / k

out = np.zeros((n, 2))

# --- wind (filtered noise, slowly modulated) ---
for ch in range(2):
    w = lowpass(rng.standard_normal(n + 60), 61)[:n]
    w = w - lowpass(w, 401)[:n] if False else w
    mod = 0.55 + 0.45 * np.sin(2 * np.pi * 0.17 * t + ch)
    out[:, ch] += w * mod * 0.9 * (env(0, 23, 1.5, 1.0)) * (1 - 0.6 * np.clip((t - 5) / 1, 0, 1))

# --- pad chords (Am F C G), 120 bpm, 2 s per chord ---
chords = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]
mtof = lambda m: 440 * 2 ** ((m - 69) / 12)
pad = np.zeros(n)
for i in range(12):
    a = i * 2.0; ch = chords[i % 4]
    e = np.clip((t - a) / 0.6, 0, 1) * np.clip((a + 2.3 - t) / 0.5, 0, 1)
    for m in ch:
        f = mtof(m)
        for h, amp in [(1, 1), (2, .35), (3, .15)]:
            pad += e * amp * np.sin(2 * np.pi * f * h * t + h) * 0.05
pad *= np.clip(t / 2.5, 0, 1) * np.clip((23 - t) / 1.2, 0, 1)
out += pad[:, None] * [1, 1]

# --- bass pulse (8th notes) from 5 s ---
bass = np.zeros(n)
for k in range(int((22.0 - 5.0) / 0.25)):
    a = 5.0 + k * 0.25; root = chords[int(a // 2) % 4][0] - 24
    seg = (t >= a) & (t < a + 0.24)
    tt = t[seg] - a
    bass[seg] += np.sin(2 * np.pi * mtof(root) * tt) * np.exp(-tt * 9) * 0.35
out += bass[:, None]

# --- kick on beats from 5 s, hats on off-beats ---
def kick(at, g=1.0):
    seg = (t >= at) & (t < at + 0.4); tt = t[seg] - at
    f = 50 + 120 * np.exp(-tt * 30)
    out[seg] += (np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 9) * 0.7 * g)[:, None]
def hat(at, g=1.0):
    seg = (t >= at) & (t < at + 0.06); tt = t[seg] - at
    nz = rng.standard_normal(seg.sum()); nz = nz - lowpass(np.concatenate([nz, np.zeros(4)]), 5)[:len(nz)]
    out[seg] += (nz * np.exp(-tt * 70) * 0.12 * g)[:, None]
for k in range(int((19.0 - 5.0) / 0.5)):
    kick(5.0 + k * 0.5)
    hat(5.25 + k * 0.5)
for k in range(8):  # outro softer
    kick(19.0 + k * 0.5, 0.6); hat(19.25 + k * 0.5, 0.6)

# --- riser 3.6 -> 5.0 ---
seg = (t >= 3.6) & (t < 5.0); tt = t[seg] - 3.6
nz = rng.standard_normal(seg.sum())
out[seg] += ((nz - lowpass(np.concatenate([nz, np.zeros(8)]), 9)[:len(nz)]) * (tt / 1.4) ** 2 * 0.35)[:, None]
out[seg] += (np.sin(2 * np.pi * np.cumsum(200 + 600 * (tt / 1.4) ** 2) / SR) * (tt / 1.4) * 0.08)[:, None]

# --- impact at 5.0 ---
seg = (t >= 5.0) & (t < 7.0); tt = t[seg] - 5.0
boom = np.sin(2 * np.pi * np.cumsum(40 + 80 * np.exp(-tt * 6)) / SR) * np.exp(-tt * 2.2) * 0.9
nz = rng.standard_normal(seg.sum()) * np.exp(-tt * 8) * 0.25
out[seg] += (boom + nz)[:, None]

# --- whooshes ---
def whoosh(at, dur=0.6, g=0.5):
    seg = (t >= at - dur / 2) & (t < at + dur / 2); tt = (t[seg] - (at - dur / 2)) / dur
    nz = rng.standard_normal(seg.sum()); nz = lowpass(np.concatenate([nz, np.zeros(10)]), 11)[:len(nz)]
    e = np.sin(np.pi * tt) ** 2
    pan = np.stack([1 - tt, tt], 1)
    out[seg] += (nz * e * g * 2.2)[:, None] * pan
for a in [9.9, 15.9, 19.1]: whoosh(a)
for i in range(4): whoosh(10.5 + i * 1.0, 0.3, 0.25)  # callout ticks

# --- end chime ---
for m, d in [(76, 0), (81, 0.08), (84, 0.16)]:
    a = 19.8 + d; seg = (t >= a) & (t < a + 2.5); tt = t[seg] - a
    out[seg] += (np.sin(2 * np.pi * mtof(m) * tt) * np.exp(-tt * 2.5) * 0.12)[:, None]

out *= np.clip((23 - t) / 0.8, 0, 1)[:, None]
out /= np.max(np.abs(out)) * 1.12
pcm = (out * 32767).astype(np.int16)
with wave.open('audio.wav', 'wb') as f:
    f.setnchannels(2); f.setsampwidth(2); f.setframerate(SR); f.writeframes(pcm.tobytes())
print('ok')
