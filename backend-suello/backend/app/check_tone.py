from app.analyze import analyze_input
from app.schemas import AnalyzeRequest

TEXTS = [
    "The meeting starts at 3 PM tomorrow.",
    "The new health center is helpful for the community.",
    "This is the worst scam ever, I hate it!",
    "AMAZING!!! Best sale ever, buy now!!!",
]

for text in TEXTS:
    print(text)
    print("   ", analyze_input(AnalyzeRequest(text=text)))