# Frontend (static site)

The full documentation — setup, API reference, balance rules, deployment — lives
in **[../README.md](../README.md)** at the root of this project.

Quick start (frontend + roster API in one process):

```bash
cd ../backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload     # http://localhost:8000
```
