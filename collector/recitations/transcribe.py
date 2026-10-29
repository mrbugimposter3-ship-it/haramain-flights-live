"""Tarteel Quran Whisper on 15 s windows -> ident_<vid>.json (same layout as HelpOutBoran-Videos' box tracker).
Usage: transcribe.py <video_id> <audio_file> <title> <out_dir>
Plain script (no AI agent): a speech-recognition model + the letter matcher in qmatch.py."""
import os, sys, json, subprocess, numpy as np
import torch; torch.set_num_threads(int(os.environ.get('ASR_THREADS', '4')))
from transformers import WhisperForConditionalGeneration, WhisperProcessor
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import qmatch
vid, audio, title, out_dir = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
M = 'tarteel-ai/whisper-base-ar-quran'; proc = WhisperProcessor.from_pretrained(M); model = WhisperForConditionalGeneration.from_pretrained(M).eval()
x = np.frombuffer(subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-threads', '2', '-i', audio, '-ac', '1', '-ar', '16000', '-f', 's16le', '-'],
                                 capture_output=True, check=True).stdout, np.int16).astype(np.float32) / 32768
if len(x) < 16000 * 30: raise SystemExit(f'audio too short or undecodable ({len(x) / 16000:.0f} s)')
W = []; out = os.path.join(out_dir, f'ident_{vid}.json')
for t in range(0, int(len(x) / 16000), 15):
    seg = x[t * 16000:(t + 15) * 16000]
    if len(seg) < 16000 or float(np.sqrt(np.mean(seg ** 2))) < 0.004:   # silence / near-silence: skip
        W.append(dict(t=t, top=[], text='')); continue
    f = proc(seg, sampling_rate=16000, return_tensors='pt').input_features
    with torch.inference_mode(): ids = model.generate(f, max_new_tokens=200, num_beams=1, no_repeat_ngram_size=5)
    txt = proc.batch_decode(ids, skip_special_tokens=True)[0].strip()
    m = qmatch.match(txt); W.append(dict(t=t, top=[m[:3]] if m else [], text=txt))
json.dump(dict(video=vid, title=title, method='tarteel-ai/whisper-base-ar-quran 15s windows + span char-trigram match (allp/qmatch.py)', windows=W),
          open(out + '.tmp', 'w'), ensure_ascii=False, indent=1)
os.replace(out + '.tmp', out)
print('ok', len(W))
