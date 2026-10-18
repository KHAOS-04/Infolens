from pydantic import BaseModel


# What the client sends to POST /analyze.
class AnalyzeRequest(BaseModel):
    text: str | None = None
    image_base64: str | None = None
    language_hint: str = "auto"


# One source that supports the analysis.
class Source(BaseModel):
    title: str
    url: str
    domain: str
    tier: int


# What POST /analyze sends back.
class AnalyzeResponse(BaseModel):
    content_type: str
    content_tone: str
    information_status: str
    analysis_paragraph: str
    sources: list[Source]
    notice: str | None = None