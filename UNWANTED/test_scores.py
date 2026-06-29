import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), 'backend')))
from rag.retriever import get_retriever

questions = [
  "What is the distance between LPG storage vessels and the plant boundary for a capacity of 40-350 Cu. Mt. of water?",
  "When are hot work permits required for non flameproof electrical tools in a Hazardous Area?",
  "How frequently must Earth resistance on individual electrodes or Earth pit Testing be conducted?",
  "According to OISD-STD-129, what is the periodic inspection interval for above ground fire water tanks externally and internally?",
  "What are the inspection requirements for fire water tanks and water reservoirs under OISD standards?",
  "What are the safety distances required for LPG storage vessels from plant boundaries?",
  "What is the required frequency for thermography of panels and checking of VCB bottles for healthiness?"
]

retriever = get_retriever(k=1)
for q in questions:
    docs = retriever.invoke(q)
    if docs:
        score = docs[0].metadata.get('score', 0)
        print(f"Score: {score:.3f} | Q: {q}")
