import math
import struct
import wave
import os
import subprocess

SAMPLE_RATE = 44100
OUT_DIR = "AnimForgeLab/projects/cybersecurity-explainer/public/audio"
os.makedirs(OUT_DIR, exist_ok=True)

# 1. GENERATE VOICEOVER CLIPS VIA MACOS NATIVE TTS (RISHI - en_IN)
vo_lines = {
    "vo_scene1": "Socho... agar hackers ko attack karne ke liye khud har step perform hi na karna pade?",
    "vo_scene2": "2026 mein cybercriminals AI tools ka use karke software ki weaknesses identify karne aur attacks automate karne ki koshish kar rahe hain.",
    "vo_scene3": "AI speed badha sakta hai: information analyse karna, weaknesses identify karna aur repetitive tasks automate karna. Lekin iska matlab ye nahi ki har AI system automatically kisi bhi account ko hack kar sakta hai.",
    "vo_scene4": "India ki cyber agency ne banks, fintech companies aur financial institutions ko AI assisted attacks ke badhte risk ke baare mein alert kiya hai.",
    "vo_scene5": "Protection ke liye software updated rakho, multi factor authentication use karo aur suspicious links se bachkar raho.",
    "vo_scene6": "AI khud na hero hai, na villain. Asli difference is baat se padega ki hum iska use kaise karte hain."
}

for name, text in vo_lines.items():
    aiff_path = f"/tmp/{name}.aiff"
    wav_path = f"{OUT_DIR}/{name}.wav"
    subprocess.run(["say", "-v", "Rishi", "-r", "185", text, "-o", aiff_path], check=True)
    subprocess.run(["ffmpeg", "-y", "-i", aiff_path, "-ac", "2", "-ar", "44100", wav_path], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if os.path.exists(aiff_path):
        os.remove(aiff_path)
    print(f"Generated {wav_path}")

# 2. SYNTHESIZE PROCEDURAL SOUND EFFECTS & FUTURISTIC MUSIC SCORE
def create_wav(filename, samples):
    with wave.open(filename, 'w') as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(SAMPLE_RATE)
        packed = []
        for l, r in samples:
            l = max(-32767, min(32767, int(l * 32767)))
            r = max(-32767, min(32767, int(r * 32767)))
            packed.append(struct.pack('<hh', l, r))
        wf.writeframes(b''.join(packed))

# Cyberpunk Soundtrack (56s)
def synth_cyber_music(duration=56.0):
    samples = []
    total = int(duration * SAMPLE_RATE)
    # Bass synth notes in F minor / C / Db / Eb
    bass_notes = [87.31, 87.31, 103.83, 116.54, 77.78, 87.31] # F2, F2, Ab2, Bb2, Eb2, F2

    for i in range(total):
        t = i / SAMPLE_RATE

        # 16th note synth arp clock (124 BPM -> beat = 0.4838s, 16th = 0.1209s)
        beat_t = t / 0.4838
        step = int(t / 0.1209)
        arp_freq = bass_notes[(step // 4) % len(bass_notes)] * (1.0 if step % 4 == 0 else 1.5 if step % 4 == 1 else 2.0 if step % 4 == 2 else 1.25)

        arp_env = math.exp(-((t % 0.1209) / 0.1209) * 4.5)
        # Punchy saw wave with resonance
        saw = (2.0 * ((t * arp_freq) % 1.0) - 1.0) * arp_env * 0.15

        # Sub-bass drone
        sub_freq = bass_notes[(int(t / 4.0)) % len(bass_notes)] * 0.5
        sub = math.sin(2 * math.pi * sub_freq * t) * 0.22

        # High tech pad
        pad_chord = [174.61, 220.0, 261.63, 349.23] # F3, A3, C4, F4
        pad = 0.0
        for f in pad_chord:
            pad += math.sin(2 * math.pi * f * (1.0 + 0.003 * math.sin(t * 2.0)) * t) * 0.04

        # Hi-hat tick every 8th note
        hat_env = math.exp(-((t % 0.2419) / 0.05)) if (t % 0.2419) < 0.05 else 0.0
        noise = (math.sin(t * 88888.8) % 0.2 - 0.1) * hat_env * 0.08

        mix_l = (sub * 0.9 + saw * 0.8 + pad * 0.7 + noise)
        mix_r = (sub * 0.9 + saw * 0.6 + pad * 0.8 + noise * 0.9)

        # Master envelope (fade in 1.5s, fade out 2.5s)
        master_env = min(1.0, t / 1.5)
        if t > duration - 2.5:
            master_env *= max(0.0, (duration - t) / 2.5)

        samples.append((mix_l * master_env, mix_r * master_env))
    return samples

# Digital Glitch SFX
def synth_glitch(duration=1.2):
    samples = []
    total = int(duration * SAMPLE_RATE)
    for i in range(total):
        t = i / SAMPLE_RATE
        noise = (math.sin(t * 77777.7) % 0.4 - 0.2)
        buzz = math.sin(2 * math.pi * 180 * t) if (int(t * 60) % 2 == 0) else 0.0
        env = math.exp(-t * 2.5)
        val = (noise + buzz) * env * 0.4
        samples.append((val, val * 0.8))
    return samples

# Scanner Radar Ping
def synth_scan(duration=2.5):
    samples = []
    total = int(duration * SAMPLE_RATE)
    for i in range(total):
        t = i / SAMPLE_RATE
        sweep = math.sin(2 * math.pi * (800 + 400 * math.sin(t * 8.0)) * t) * 0.15
        ping = math.sin(2 * math.pi * 1760 * t) * math.exp(-t * 3.0) * 0.25
        samples.append(((sweep + ping) * 0.8, (sweep + ping)))
    return samples

# Alert Klaxon
def synth_alert(duration=2.0):
    samples = []
    total = int(duration * SAMPLE_RATE)
    for i in range(total):
        t = i / SAMPLE_RATE
        pitch = 950 if int(t * 6) % 2 == 0 else 750
        val = math.sin(2 * math.pi * pitch * t) * math.exp(-(t % 0.33) * 4.0) * 0.3
        samples.append((val, val))
    return samples

# Security Shield Power Up
def synth_shield(duration=2.5):
    samples = []
    total = int(duration * SAMPLE_RATE)
    for i in range(total):
        t = i / SAMPLE_RATE
        rise = 100 + 1200 * (t / duration) ** 2
        env = math.sin(math.pi * (t / duration))
        chime = math.sin(2 * math.pi * 1318.5 * t) * math.exp(-t * 1.5) * 0.15
        val = (math.sin(2 * math.pi * rise * t) * 0.25 + chime) * env
        samples.append((val, val * 0.9))
    return samples

create_wav(f"{OUT_DIR}/cyber_music.wav", synth_cyber_music(56.0))
create_wav(f"{OUT_DIR}/glitch_sfx.wav", synth_glitch(1.2))
create_wav(f"{OUT_DIR}/scan_sfx.wav", synth_scan(2.5))
create_wav(f"{OUT_DIR}/alert_sfx.wav", synth_alert(2.0))
create_wav(f"{OUT_DIR}/shield_sfx.wav", synth_shield(2.5))
print("All audio files generated successfully!")
