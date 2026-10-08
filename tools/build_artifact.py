#!/usr/bin/env python3
"""Inline assets/Xbot.glb into artifact.src.html -> artifact.html (single-file artifact)."""
import base64, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
src = (root / 'artifact.src.html').read_text()
b64 = base64.b64encode((root / 'assets' / 'Xbot.glb').read_bytes()).decode()
(root / 'artifact.html').write_text(src.replace("'__MODEL_B64__'", "'" + b64 + "'"))
print('wrote artifact.html', round(len(src) / 1e6 + len(b64) / 1e6, 2), 'MB')
