"""Build-time download only. Runtime runs offline with a pinned model."""
import json, pathlib, sys
from huggingface_hub import snapshot_download
from model_spec import MODEL_ID, MODEL_REPO, MODEL_REVISION, MODEL_FILES
if __name__ == '__main__':
    target = pathlib.Path(sys.argv[1] if len(sys.argv)>1 else '/opt/model')
    snapshot_download(repo_id=MODEL_REPO, revision=MODEL_REVISION, allow_patterns=MODEL_FILES, local_dir=target)
    missing = [name for name in MODEL_FILES if not (target/name).is_file()]
    if missing: raise RuntimeError('Model download incomplete')
    (target/'manifest.json').write_text(json.dumps({'model':MODEL_ID, 'repository':MODEL_REPO, 'revision':MODEL_REVISION}))
