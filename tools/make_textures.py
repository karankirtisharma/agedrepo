"""Generates the ink shader's textures (original, procedural, seamlessly tiling).

    python tools/make_textures.py

public/textures/hatch.png  1024px wavy vertical lines, sampled for hatching and the door light
public/textures/noise.png  256px soft grain, used for edge jitter and film grain
Needs numpy and Pillow.
"""
from pathlib import Path

import numpy as np
from PIL import Image

OUT = Path(__file__).resolve().parent.parent / "public" / "textures"
rng = np.random.default_rng(7)


def periodic_wobble(u, v, terms, amp):
    """Sum of sines with integer frequencies, so it wraps at the tile edge."""
    w = np.zeros_like(u)
    for _ in range(terms):
        kx, ky = rng.integers(0, 4), rng.integers(1, 7)
        w += np.sin(2 * np.pi * (kx * u + ky * v) + rng.uniform(0, 2 * np.pi)) / (kx + ky)
    return w * amp


def blur_wrap(img, sigma):
    """Gaussian blur via FFT, which wraps around and keeps the tile seamless."""
    h, w = img.shape
    fy, fx = np.fft.fftfreq(h)[:, None], np.fft.fftfreq(w)[None, :]
    k = np.exp(-2 * (np.pi * sigma) ** 2 * (fx ** 2 + fy ** 2))
    return np.real(np.fft.ifft2(np.fft.fft2(img) * k))


def save(arr, name, mean, std):
    arr = (arr - arr.mean()) / arr.std() * std + mean
    Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "L").convert("RGB").save(OUT / name)
    print(name, arr.shape)


def hatch(size=1024, lines=76):
    v, u = np.mgrid[0:size, 0:size] / size
    phase = lines * u + periodic_wobble(u, v, 14, 1.6)
    # a fine jitter, as if drawn by hand
    phase += 0.06 * np.sin(2 * np.pi * (rng.integers(20, 40) * v + rng.integers(1, 4) * u))
    wave = np.cos(2 * np.pi * phase)
    # each line gets its own weight that drifts along its length (periodic in the line index, so it tiles)
    weight = np.zeros_like(u)
    for _ in range(10):
        m, ky = rng.integers(3, lines // 2), rng.integers(0, 5)
        weight += np.sin(2 * np.pi * (m * phase / lines + ky * v) + rng.uniform(0, 2 * np.pi))
    ink = np.tanh((wave + weight * 0.12) * 2.2)
    return blur_wrap(ink, 1.2)


def noise(size=256):
    return blur_wrap(rng.standard_normal((size, size)), 1.6)


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    save(hatch(), "hatch.png", 120, 66)
    save(noise(), "noise.png", 111, 48)
