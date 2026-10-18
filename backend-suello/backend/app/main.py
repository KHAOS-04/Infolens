from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.pipeline import run_pipeline
from app.schemas import AnalyzeRequest, AnalyzeResponse

app = FastAPI(title="Infolens API")

# Allow every origin while we develop. Restrict this before going to production.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# Simple check that the server is running.
@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


# Receive text and/or an image and return the analysis.
@app.post("/analyze", response_model=AnalyzeResponse)
def analyze(request: AnalyzeRequest) -> AnalyzeResponse:
    return run_pipeline(request)