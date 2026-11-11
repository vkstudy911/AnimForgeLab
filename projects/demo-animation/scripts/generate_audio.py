import math
import struct
import wave
import os

SAMPLE_RATE = 44100

def create_wav(filename, samples):
    os.makedirs(os.path.dirname(filename), exist_ok=True)
    with wave.open(filename, 'w') as wf:
        wf.setnchannels(2)  # Stereo
        wf.setsampwidth(2)  # 16-bit
        wf.setframerate(SAMPLE_RATE)
        packed = []
        for l, r in samples:
            l = max(-32767, min(32767, int(l * 32767)))
            r = max(-32767, min(32767, int(r * 32767)))
            packed.append(struct.pack('<hh', l, r))
        wf.writeframes(b''.join(packed))

def synth_music(duration=38.5):
    samples = []
    total = int(duration * SAMPLE_RATE)
    # Chord progression: Dm, F, C, G -> Ending with glorious D major / A
    notes_progression = [
        # Sec 0-10: Gentle Mystery (D4, F4, A4)
        [293.66, 349.23, 440.0],
        # Sec 10-18: Warm Discovery (F4, A4, C5)
        [349.23, 440.0, 523.25],
        # Sec 18-25: Strained Climbing (G3, D4, Bb4)
        [196.0, 293.66, 466.16],
        # Sec 25-31: Climactic Horizon (A3, E4, C#5)
        [220.0, 329.63, 554.37],
        # Sec 31-38: Triumphant Galaxy Resolution (D4, F#4, A4, D5)
        [293.66, 369.99, 440.0, 587.33]
    ]

    for i in range(total):
        t = i / SAMPLE_RATE
        sec_idx = min(int(t / 8.0), len(notes_progression) - 1)
        chord = notes_progression[sec_idx]

        # Warm pad synth
        val_l, val_r = 0.0, 0.0
        for idx, freq in enumerate(chord):
            # Slow vibrato
            detune = 1.0 + 0.002 * math.sin(2 * math.pi * 3.5 * t + idx)
            wave_val = math.sin(2 * math.pi * freq * detune * t) * 0.12
            # Soft overtone
            wave_val += math.sin(2 * math.pi * freq * 2.0 * t) * 0.03
            val_l += wave_val * (0.8 if idx % 2 == 0 else 0.5)
            val_r += wave_val * (0.5 if idx % 2 == 0 else 0.8)

        # Gentle bell arpeggio every 1.5s
        arp_t = (t % 1.5)
        arp_note = chord[int(t * 2.5) % len(chord)] * 2.0
        env = math.exp(-arp_t * 3.5)
        bell = math.sin(2 * math.pi * arp_note * t) * env * 0.15
        val_l += bell * 0.7
        val_r += bell * 0.7

        # Fade in & fade out
        master_env = min(1.0, t / 2.0)
        if t > duration - 2.5:
            master_env *= max(0.0, (duration - t) / 2.5)

        samples.append((val_l * master_env, val_r * master_env))
    return samples

def synth_forest(duration=10.0):
    samples = []
    total = int(duration * SAMPLE_RATE)
    for i in range(total):
        t = i / SAMPLE_RATE
        # Low wind
        wind = math.sin(2 * math.pi * 70 * t) * 0.05 * (0.5 + 0.5 * math.sin(t * 0.4))
        # High cricket pulse
        cricket = math.sin(2 * math.pi * 4800 * t) * (0.015 if (int(t * 8) % 3 == 0) else 0.002)
        samples.append((wind + cricket, wind + cricket * 0.9))
    return samples

def synth_whoosh(duration=2.5):
    samples = []
    total = int(duration * SAMPLE_RATE)
    for i in range(total):
        t = i / SAMPLE_RATE
        freq = 1800 * math.exp(-t * 1.8) + 120
        env = math.sin(math.pi * (t / duration)) ** 1.5
        noise = (math.sin(t * 31415.9) % 0.2 - 0.1) * 0.3
        val = (math.sin(2 * math.pi * freq * t) + noise) * env * 0.4
        samples.append((val, val * 0.9))
    return samples

def synth_chime(duration=3.0):
    samples = []
    total = int(duration * SAMPLE_RATE)
    freqs = [1046.5, 1318.5, 1567.98, 2093.0] # C6, E6, G6, C7
    for i in range(total):
        t = i / SAMPLE_RATE
        val = 0.0
        for f in freqs:
            val += math.sin(2 * math.pi * f * t) * math.exp(-t * 2.2) * 0.1
        samples.append((val, val))
    return samples

def synth_wind(duration=8.0):
    samples = []
    total = int(duration * SAMPLE_RATE)
    for i in range(total):
        t = i / SAMPLE_RATE
        gust = 0.5 + 0.5 * math.sin(2 * math.pi * 0.3 * t)
        low = math.sin(2 * math.pi * (90 + 30 * gust) * t) * 0.15
        hiss = (math.sin(t * 43210.0) % 0.2 - 0.1) * 0.15 * gust
        samples.append(((low + hiss) * 0.8, (low + hiss)))
    return samples

def synth_launch(duration=3.5):
    samples = []
    total = int(duration * SAMPLE_RATE)
    for i in range(total):
        t = i / SAMPLE_RATE
        freq = 150 + 1400 * (t / duration) ** 2
        env = math.sin(math.pi * (t / duration))
        val = math.sin(2 * math.pi * freq * t) * env * 0.35
        samples.append((val * 0.9, val))
    return samples

def synth_galaxy(duration=7.0):
    samples = []
    total = int(duration * SAMPLE_RATE)
    chimes = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98]
    for i in range(total):
        t = i / SAMPLE_RATE
        val_l, val_r = 0.0, 0.0
        for idx, f in enumerate(chimes):
            delay = idx * 0.3
            if t > delay:
                dt = t - delay
                amp = math.exp(-dt * 0.8) * 0.08
                s = math.sin(2 * math.pi * f * dt) * amp
                val_l += s * (0.8 if idx % 2 == 0 else 0.4)
                val_r += s * (0.4 if idx % 2 == 0 else 0.8)
        samples.append((val_l, val_r))
    return samples

out_dir = "AnimForgeLab/projects/demo-animation/public/audio"
create_wav(f"{out_dir}/music.wav", synth_music(38.5))
create_wav(f"{out_dir}/forest.wav", synth_forest(6.0))
create_wav(f"{out_dir}/star_whoosh.wav", synth_whoosh(2.5))
create_wav(f"{out_dir}/star_pickup.wav", synth_chime(3.0))
create_wav(f"{out_dir}/mountain_wind.wav", synth_wind(8.0))
create_wav(f"{out_dir}/star_launch.wav", synth_launch(3.5))
create_wav(f"{out_dir}/galaxy_sparkle.wav", synth_galaxy(7.0))
print("Audio synthesis complete!")
