const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, PageBreak, Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType, PageNumber, Footer, LevelFormat } = require("docx");
const fs = require("fs");

function createReport() {
    const doc = new Document({
        creator: "Savya",
        title: "PolicyIQ Project Report",
        styles: {
            default: {
                document: {
                    run: {
                        font: "Arial",
                        size: 24,
                    },
                    paragraph: {
                        spacing: { before: 120, after: 120 },
                    },
                },
                heading1: {
                    run: {
                        font: "Arial",
                        size: 32,
                        bold: true,
                    },
                    paragraph: {
                        spacing: { before: 120, after: 120 },
                        alignment: AlignmentType.CENTER,
                    }
                },
                heading2: {
                    run: {
                        font: "Arial",
                        size: 28,
                        bold: true,
                    },
                    paragraph: {
                        spacing: { before: 120, after: 120 },
                        alignment: AlignmentType.LEFT,
                    }
                },
                heading3: {
                    run: {
                        font: "Arial",
                        size: 26,
                        bold: true,
                    },
                    paragraph: {
                        spacing: { before: 120, after: 120 },
                        alignment: AlignmentType.LEFT,
                    }
                }
            }
        },
        numbering: {
            config: [
                {
                    reference: "bullet-list",
                    levels: [
                        {
                            level: 0,
                            format: LevelFormat.BULLET,
                            text: "-",
                            alignment: AlignmentType.LEFT,
                            style: {
                                paragraph: {
                                    indent: { left: 720, hanging: 360 },
                                },
                            },
                        }
                    ]
                },
                {
                    reference: "numbered-list",
                    levels: [
                        {
                            level: 0,
                            format: LevelFormat.DECIMAL,
                            text: "%1.",
                            alignment: AlignmentType.LEFT,
                            style: {
                                paragraph: {
                                    indent: { left: 720, hanging: 360 },
                                },
                            },
                        }
                    ]
                }
            ]
        },
        sections: [
            {
                properties: {
                    page: {
                        size: {
                            width: 11906,
                            height: 16838,
                        },
                        margin: {
                            top: 1440,
                            bottom: 1440,
                            left: 1440,
                            right: 1440,
                        }
                    }
                },
                footers: {
                    default: new Footer({
                        children: [
                            new Paragraph({
                                alignment: AlignmentType.CENTER,
                                children: [
                                    new TextRun({
                                        children: [PageNumber.CURRENT],
                                    })
                                ]
                            })
                        ]
                    })
                },
                children: buildContent()
            }
        ]
    });

    Packer.toBuffer(doc).then((buffer) => {
        fs.writeFileSync("/Users/savyaraj/Desktop/policyiq/PolicyIQ_Project_Report.docx", buffer);
        console.log("Document created successfully at /Users/savyaraj/Desktop/policyiq/PolicyIQ_Project_Report.docx");
        
        // Also try to copy to /home/claude/ as requested in the prompt, ignore if it fails
        try {
            fs.mkdirSync("/home/claude", { recursive: true });
            fs.writeFileSync("/home/claude/PolicyIQ_Project_Report.docx", buffer);
            console.log("Document copied to /home/claude/PolicyIQ_Project_Report.docx");
        } catch (e) {
            console.log("Could not copy to /home/claude/PolicyIQ_Project_Report.docx: " + e.message);
        }
    });
}

function P(text, options = {}) {
    const runs = [];
    if (text) {
        runs.push(new TextRun({ text, ...options.run }));
    }
    return new Paragraph({
        children: runs,
        ...options.para
    });
}

function PageBreakP() {
    return new Paragraph({
        children: [new PageBreak()]
    });
}

function H1(text) {
    return new Paragraph({
        text: text,
        heading: HeadingLevel.HEADING_1
    });
}

function H2(text) {
    return new Paragraph({
        text: text,
        heading: HeadingLevel.HEADING_2
    });
}

function H3(text) {
    return new Paragraph({
        text: text,
        heading: HeadingLevel.HEADING_3
    });
}

function Bullet(text) {
    return new Paragraph({
        text: text,
        numbering: {
            reference: "bullet-list",
            level: 0
        }
    });
}

function Numbered(text) {
    return new Paragraph({
        text: text,
        numbering: {
            reference: "numbered-list",
            level: 0
        }
    });
}

function MonoP(text) {
    return new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
            new TextRun({
                text: text,
                font: "Courier New",
                size: 20
            })
        ]
    });
}

function MonoLeftP(text) {
    // Preserve spaces by using multiple TextRuns if needed, but in docx simple leading spaces are tricky.
    // docx TextRun strips leading spaces unless we do something special, or we just pass the text.
    // To preserve spaces, we can split text into spaces and non-spaces, but let's try just passing text.
    // Wait, the easiest way to preserve spaces is a TextRun with `text` and no special handling?
    // Let's replace spaces with non-breaking spaces \u00A0 just to be safe.
    const safeText = text.replace(/ /g, "\u00A0");
    return new Paragraph({
        alignment: AlignmentType.LEFT,
        children: [
            new TextRun({
                text: safeText,
                font: "Courier New",
                size: 20
            })
        ]
    });
}

function buildTable(headers, rows, widths) {
    const tableRows = [];
    
    if (headers && headers.length > 0) {
        tableRows.push(
            new TableRow({
                tableHeader: true,
                children: headers.map((h, i) => new TableCell({
                    width: { size: widths[i], type: WidthType.DXA },
                    shading: { fill: "D5E8F0", type: ShadingType.CLEAR },
                    margins: { top: 80, bottom: 80, left: 120, right: 120 },
                    children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })]
                }))
            })
        );
    }
    
    for (const row of rows) {
        tableRows.push(
            new TableRow({
                children: row.map((cellText, i) => new TableCell({
                    width: { size: widths[i], type: WidthType.DXA },
                    margins: { top: 80, bottom: 80, left: 120, right: 120 },
                    children: [new Paragraph({ text: cellText })]
                }))
            })
        );
    }
    
    return new Table({
        columnWidths: widths,
        borders: {
            top: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
            bottom: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
            left: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
            right: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
            insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
            insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
        },
        rows: tableRows
    });
}

function buildTOCTable(rows) {
    const tableRows = [];
    tableRows.push(
        new TableRow({
            children: [
                new TableCell({
                    width: { size: 7500, type: WidthType.DXA },
                    children: [new Paragraph({ children: [new TextRun({ text: "Section / Chapter", bold: true })] })]
                }),
                new TableCell({
                    width: { size: 1500, type: WidthType.DXA },
                    children: [new Paragraph({ children: [new TextRun({ text: "Page", bold: true })], alignment: AlignmentType.RIGHT })]
                })
            ]
        })
    );
    for (const row of rows) {
        tableRows.push(
            new TableRow({
                children: [
                    new TableCell({
                        width: { size: 7500, type: WidthType.DXA },
                        children: [new Paragraph({ text: row })]
                    }),
                    new TableCell({
                        width: { size: 1500, type: WidthType.DXA },
                        children: [new Paragraph({ text: "" })]
                    })
                ]
            })
        );
    }
    return new Table({
        columnWidths: [7500, 1500],
        borders: {
            top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
            bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
            left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
            right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
            insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
            insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
        },
        rows: tableRows
    });
}

function buildContent() {
    return [
        // COVER PAGE
        P("INDIAN OIL CORPORATION LIMITED", { para: { alignment: AlignmentType.CENTER }, run: { bold: true, size: 36 } }),
        P("(Paradip Refinery)", { para: { alignment: AlignmentType.CENTER, border: { bottom: { color: "000000", space: 1, style: BorderStyle.SINGLE, size: 6 } } }, run: { bold: true, size: 24 } }),
        P("POLICYIQ: AI-POWERED REGULATORY COMPLIANCE CHATBOT", { para: { alignment: AlignmentType.CENTER, spacing: { before: 2400, after: 1200 } }, run: { bold: true, size: 36 } }),
        P("SUMMER INTERNSHIP PROJECT REPORT", { para: { alignment: AlignmentType.CENTER, spacing: { after: 1200 } }, run: { bold: true, size: 28 } }),
        P("(Duration: [Start Date] – [End Date])", { para: { alignment: AlignmentType.CENTER, spacing: { after: 2400 } }, run: { size: 24 } }),
        P("Name: Savya [Last Name]", { para: { alignment: AlignmentType.CENTER }, run: { size: 24 } }),
        P("Branch: Information Technology", { para: { alignment: AlignmentType.CENTER }, run: { size: 24 } }),
        P("College: Manipal Academy of Higher Education, Bengaluru", { para: { alignment: AlignmentType.CENTER }, run: { size: 24 } }),
        PageBreakP(),

        // TABLE OF CONTENTS PAGE
        H1("TABLE OF CONTENTS"),
        buildTOCTable([
            "Overview of Paradip Refinery",
            "Information Systems Department in IOCL",
            "Chapter 1 – Introduction",
            "Chapter 2 – Problem Statement",
            "Chapter 3 – Project Objectives",
            "Chapter 4 – System Architecture & Technology Stack",
            "Chapter 5 – RAG Pipeline Design",
            "Chapter 6 – Document Corpus",
            "Chapter 7 – Key Features",
            "Chapter 8 – Frontend Development",
            "Chapter 9 – Backend & API Design",
            "Chapter 10 – Results and Findings",
            "Chapter 11 – Challenges & Solutions",
            "Chapter 12 – Future Scope",
            "Chapter 13 – Conclusion",
            "References",
            "Project Repository"
        ]),
        PageBreakP(),

        // SECTION: OVERVIEW OF PARADIP REFINERY
        H1("OVERVIEW OF PARADIP REFINERY"),
        P("Paradip Refinery is Indian Oil's 11th Refinery, envisioned as the Energy Gateway to Eastern India. The 15 MMTPA Refinery has been set up at an estimated cost of Rs. 34,555 crores. The refinery is configured to process high-sulphur heavy crude oils with major secondary processing units like Fluidized Catalytic Cracker, Delayed Coking Unit (DCU) for coke production, besides Diesel Hydro-treatment and Catalytic Reformer, Alkylation unit, Merox, etc., for quality upgradation of products."),
        P("Paradip Refinery has a unique INDMAX Unit technology, indigenously developed by Indian Oil's R&D Centre. The INDMAX (FCC) Unit is designed to produce 44% LPG — the highest yield from such plants. The commissioning of the INDMAX Unit at Paradip marks a major milestone in the history of Indian refining, with Indian Oil now recognized globally as a technology licensor."),
        P("The refinery can process 100% high sulphur and heavy crude oil to produce various petroleum products like Petrol and Diesel (BS-VI quality), Kerosene, Aviation Turbine Fuel, Propylene, Sulphur, and Petroleum Coke. Paradip Refinery is spread over a total area of 3,345 acres and is equipped with a crude oil unloading facility at Paradip offshore with the first Single Point Mooring (SPM) facility on the east coast of India."),
        P("Major Products: LPG, Propylene, Polypropylene, MEG, High Speed Diesel (BS-VI), Motor Spirit (BS-VI), Reformate, ATF, Superior Kerosene Oil, Sulphur, LCO, Pet Coke & Bitumen."),
        PageBreakP(),

        // SECTION: INFORMATION SYSTEMS DEPARTMENT IN IOCL
        H1("INFORMATION SYSTEMS DEPARTMENT IN IOCL"),
        P("The Information Systems (IS) Department plays a pivotal role in ensuring the smooth functioning of all technological and digital operations within IOCL. As a central pillar supporting business continuity and operational efficiency, the IS Department is responsible for software development, network and infrastructure management, and the implementation and maintenance of enterprise resource planning (ERP) systems such as SAP."),
        P("The PolicyIQ project was developed under the IS Department, Paradip Refinery, as part of the department's initiative to leverage artificial intelligence and modern NLP technologies for improving access to regulatory compliance knowledge across the refinery."),
        P("Core Functional Areas:", { run: { bold: true } }),
        Bullet("Networking — Management of LAN, WAN, VPN, and internet connectivity across business locations"),
        Bullet("Infrastructure — Server administration, hardware management, system updates, and disaster recovery"),
        Bullet("Application Development — Design and development of customized software solutions for operational requirements"),
        Bullet("ERP Management — Implementation and maintenance of SAP modules covering finance, HR, procurement, and supply chain"),
        P("The IS Department's centralized operations are based at the Head Office, supported by location-based IS Officers who implement policies and provide on-ground technical support at refineries including Paradip."),
        PageBreakP(),

        // CHAPTER 1 – INTRODUCTION
        H1("CHAPTER 1 – INTRODUCTION"),
        P("The Indian oil and gas industry operates under a dense and continuously evolving set of regulatory standards issued by multiple governing bodies — including the Oil Industry Safety Directorate (OISD), Petroleum and Explosives Safety Organisation (PESO), Petroleum and Natural Gas Regulatory Board (PNGRB), and the Ministry of Petroleum and Natural Gas (MoPNG). Compliance professionals, safety engineers, and operations personnel at refineries like IOCL Paradip must frequently consult these documents to ensure that day-to-day operations adhere to mandated safety and procedural standards."),
        P("The regulatory corpus at IOCL Paradip spans over 31 documents covering areas such as fire protection, storage safety, pipeline operations, pressure vessel standards, and environmental compliance. Manually navigating this corpus is time-consuming, error-prone, and requires personnel to possess prior familiarity with which document governs which domain. Traditional keyword-based search tools fail to understand the semantic intent behind regulatory queries, often returning irrelevant or incomplete results."),
        P("PolicyIQ is an AI-powered regulatory compliance chatbot developed to address this challenge. Built on the Retrieval-Augmented Generation (RAG) architecture, PolicyIQ allows engineers and compliance officers to ask natural language questions and receive accurate, cited answers directly sourced from IOCL's regulatory document corpus. The system combines state-of-the-art dense vector retrieval with a large language model to deliver contextually grounded responses — dramatically reducing document lookup time and improving confidence in compliance decisions."),
        P("This report documents the design, development, and deployment of PolicyIQ as a production-ready full-stack AI system during the summer internship at IOCL Paradip Refinery."),
        PageBreakP(),

        // CHAPTER 2 – PROBLEM STATEMENT
        H1("CHAPTER 2 – PROBLEM STATEMENT"),
        H2("2.1 Background"),
        P("Regulatory compliance in the oil and gas sector is governed by a complex web of standards, directives, and guidelines. At IOCL Paradip Refinery, engineers and compliance personnel must regularly reference documents issued by OISD, PESO, PNGRB, and MoPNG to validate operational procedures, safety protocols, and equipment specifications. The volume and density of these documents creates significant friction in day-to-day compliance workflows."),
        H2("2.2 Identified Challenges"),
        Bullet("The regulatory corpus spans 31+ documents across four different standard bodies with no unified search interface"),
        Bullet("Engineers must manually identify which document governs a particular query domain before searching"),
        Bullet("Conventional keyword search fails to capture semantic intent — a query for \"fire safety near storage tanks\" may not return results using different terminology in the source document"),
        Bullet("Dense technical language in regulatory text makes manual scanning slow and error-prone"),
        Bullet("Risk of missing critical safety clauses when navigating multi-document, multi-page standards under time pressure"),
        Bullet("No existing AI-powered compliance query system existed at IOCL Paradip for this corpus"),
        H2("2.3 Objective"),
        P("To build a production-ready Retrieval-Augmented Generation (RAG) pipeline that enables natural language querying over IOCL Paradip's regulatory document corpus — delivering accurate, source-cited, confidence-graded responses through a user-friendly web interface accessible to engineers and compliance personnel."),
        PageBreakP(),

        // CHAPTER 3 – PROJECT OBJECTIVES
        H1("CHAPTER 3 – PROJECT OBJECTIVES"),
        P("The primary objective of this project is to develop PolicyIQ — an AI-powered regulatory compliance chatbot that makes IOCL's regulatory document corpus queryable through natural language, reducing lookup time and improving compliance confidence."),
        P("Specific objectives:"),
        Numbered("To ingest, parse, and index 31+ OISD, PESO, PNGRB, and MoPNG regulatory documents into a semantic vector store"),
        Numbered("To design and implement a hierarchical chunking strategy that preserves clause-level semantic coherence in regulatory text"),
        Numbered("To develop a two-stage relevance gating mechanism that filters off-topic queries before LLM invocation"),
        Numbered("To integrate a large language model (LLaMA 3.3-70B via Groq API) capable of generating cited, grounded regulatory answers"),
        Numbered("To implement confidence-tiered source cards that communicate retrieval reliability to the user"),
        Numbered("To build an 8-turn conversational memory system enabling follow-up regulatory queries"),
        Numbered("To develop a production-quality full-stack web interface with IOCL branding, Hindi translation toggle, typeahead suggestions, and an admin panel"),
        Numbered("To demonstrate PolicyIQ as a deployable enterprise compliance assistance tool for IOCL Paradip Refinery"),
        PageBreakP(),

        // CHAPTER 4 – SYSTEM ARCHITECTURE & TECHNOLOGY STACK
        H1("CHAPTER 4 – SYSTEM ARCHITECTURE & TECHNOLOGY STACK"),
        H2("4.1 Architecture Overview"),
        P("PolicyIQ follows a full-stack RAG (Retrieval-Augmented Generation) architecture organized into four layers:"),
        Bullet("Frontend Layer: React + Vite + Tailwind CSS (user interface, chat, source cards)"),
        Bullet("Backend Layer: FastAPI (Python) — query processing, retrieval orchestration, LLM integration"),
        Bullet("Vector Store Layer: FAISS — semantic similarity search over embedded regulatory chunks"),
        Bullet("LLM Layer: Groq-hosted LLaMA 3.3-70B — response generation with citations"),
        H2("4.2 System Data Flow"),
        P("The request lifecycle flows as follows — use a plain-text flow diagram using Paragraphs with indentation, not a table:"),
        MonoP("User Query (React Frontend)"),
        MonoP("        │"),
        MonoP("        ▼"),
        MonoP("FastAPI Backend"),
        MonoP("        │"),
        MonoP("   ┌────┴────┐"),
        MonoP("   ▼         ▼"),
        MonoP("Stage 1    Conversation"),
        MonoP("Relevance  Memory (8-turn)"),
        MonoP("Gate"),
        MonoP("   │"),
        MonoP("        ▼"),
        MonoP("FAISS Vector Store"),
        MonoP("(HuggingFace all-MiniLM-L6-v2 Embeddings)"),
        MonoP("   │"),
        MonoP("   ▼"),
        MonoP("Stage 2 Relevance Re-scoring"),
        MonoP("   │"),
        MonoP("   ▼"),
        MonoP("Groq API — LLaMA 3.3-70B"),
        MonoP("   │"),
        MonoP("   ▼"),
        MonoP("Response + Source Cards (Confidence-Tiered)"),
        MonoP("   │"),
        MonoP("   ▼"),
        MonoP("React Frontend (Chat UI + PDF Viewer)"),
        H2("4.3 Technology Stack"),
        buildTable(
            ["Layer", "Technology", "Purpose"],
            [
                ["Frontend", "React 18, Vite, Tailwind CSS", "Chat UI, source cards, admin panel, PDF viewer"],
                ["Backend", "FastAPI, Python 3.11", "REST API, query orchestration, RAG pipeline"],
                ["Vector Store", "FAISS", "Dense similarity search over regulatory embeddings"],
                ["Embeddings", "HuggingFace all-MiniLM-L6-v2", "384-dim sentence embeddings"],
                ["LLM", "Groq API — LLaMA 3.3-70B", "Response generation with regulatory context"],
                ["Document Processing", "PyMuPDF, LangChain Text Splitters", "PDF parsing, hierarchical chunking"],
                ["Typeahead Search", "Word-based prefix filtering", "Curated regulatory query suggestions"],
                ["Conversational Memory", "In-context 8-turn history", "Follow-up query support"],
                ["UI Theme", "Glassmorphism, IOCL brand colors", "Enterprise-grade visual design"]
            ],
            [1500, 3500, 4000]
        ),
        PageBreakP(),

        // CHAPTER 5 – RAG PIPELINE DESIGN
        H1("CHAPTER 5 – RAG PIPELINE DESIGN"),
        H2("5.1 Introduction"),
        P("The core of PolicyIQ is a Retrieval-Augmented Generation (RAG) pipeline that combines dense vector retrieval with large language model generation. Unlike a standalone LLM, RAG grounds every response in retrieved regulatory text, significantly reducing hallucination and ensuring that all answers are traceable to specific source documents."),
        H2("5.2 Document Ingestion"),
        Bullet("31+ regulatory PDFs parsed using PyMuPDF (fitz)"),
        Bullet("Documents span OISD, PESO, PNGRB, and MoPNG standards covering fire safety, pipeline standards, storage norms, and operational procedures"),
        Bullet("Each document processed page-by-page with text extraction and cleaning"),
        H2("5.3 Hierarchical Chunking Strategy"),
        P("Regulatory documents contain structured clauses, sub-clauses, and annexures. A flat fixed-size chunking approach risks splitting mid-clause, destroying the semantic integrity of regulatory statements. PolicyIQ implements a hierarchical chunking strategy:"),
        Bullet("Primary split: section and clause boundaries detected via heading patterns"),
        Bullet("Secondary split: LangChain RecursiveCharacterTextSplitter with 512-token chunks and 64-token overlap"),
        Bullet("Each chunk tagged with metadata: document name, standard body (OISD/PESO/PNGRB/MoPNG), section, page number"),
        P("This ensures that each retrieved chunk represents a complete, semantically coherent regulatory clause."),
        H2("5.4 Embedding & Indexing"),
        Bullet("Embedding model: HuggingFace all-MiniLM-L6-v2 (384-dimensional dense vectors)"),
        Bullet("All chunks embedded and indexed into a FAISS flat index using cosine similarity"),
        Bullet("FAISS index serialized to disk for persistent serving without re-indexing on restart"),
        H2("5.5 Two-Stage Relevance Gating"),
        P("A key design decision in PolicyIQ is the two-stage relevance gate, which prevents the LLM from being invoked on out-of-domain or low-quality queries:"),
        Numbered("Stage 1 — Pre-Retrieval Domain Gate: Checks whether the incoming query is relevant to the oil and gas regulatory domain. Queries that fail this gate receive a graceful fallback response without hitting the vector store or LLM."),
        Numbered("Stage 2 — Post-Retrieval Chunk Re-scoring: After FAISS retrieval, each returned chunk is re-scored against the query using cosine similarity thresholds. Chunks below the confidence threshold are dropped. If insufficient chunks survive, the system responds with a low-confidence notice rather than hallucinating."),
        H2("5.6 LLM Integration"),
        Bullet("LLM: LLaMA 3.3-70B served via Groq API (ultra-low latency inference)"),
        Bullet("Surviving chunks from Stage 2 assembled into a structured prompt as regulatory context"),
        Bullet("Prompt instructs the model to answer strictly from provided context, cite source documents, and flag if the answer is not found in the corpus"),
        Bullet("8-turn conversation history prepended to each prompt for follow-up query support"),
        H2("5.7 Response Assembly"),
        Bullet("LLM response returned with inline source citations"),
        Bullet("Each source chunk assigned a confidence tier (High / Medium / Low) based on cosine similarity score"),
        Bullet("Source cards displayed in the frontend with document name, section, page number, and confidence tier"),
        Bullet("Optional per-message Hindi translation via secondary LLM call if toggle is active"),
        PageBreakP(),

        // CHAPTER 6 – DOCUMENT CORPUS
        H1("CHAPTER 6 – DOCUMENT CORPUS"),
        H2("6.1 Overview"),
        P("PolicyIQ's knowledge base consists of 31+ regulatory documents sourced from four governing bodies that regulate the Indian oil and gas industry. The corpus covers fire protection, pipeline operations, storage norms, pressure vessel standards, safety management, and environmental compliance."),
        H2("6.2 Regulatory Bodies"),
        buildTable(
            ["Standard Body", "Full Name", "Scope"],
            [
                ["OISD", "Oil Industry Safety Directorate", "Safety standards for petroleum installations, fire protection, pipelines, storage"],
                ["PESO", "Petroleum and Explosives Safety Organisation", "Safety norms for petroleum products, pressure vessels, explosives handling"],
                ["PNGRB", "Petroleum and Natural Gas Regulatory Board", "Regulatory framework for petroleum and natural gas pipelines and infrastructure"],
                ["MoPNG", "Ministry of Petroleum and Natural Gas", "Government directives, policy circulars, operational guidelines"]
            ],
            [1500, 3500, 4000]
        ),
        H2("6.3 Corpus Statistics"),
        buildTable(
            ["Attribute", "Value"],
            [
                ["Total Documents", "31+"],
                ["Standard Bodies Covered", "4 (OISD, PESO, PNGRB, MoPNG)"],
                ["Primary Domains", "Fire Safety, Storage, Pipelines, Pressure Vessels, HSE"],
                ["Chunk Size", "512 tokens"],
                ["Chunk Overlap", "64 tokens"],
                ["Embedding Dimensions", "384"],
                ["Vector Index Type", "FAISS Flat (Cosine Similarity)"]
            ],
            [4000, 5000]
        ),
        PageBreakP(),

        // CHAPTER 7 – KEY FEATURES
        H1("CHAPTER 7 – KEY FEATURES"),
        H2("7.1 Two-Stage Relevance Gating"),
        P("A pre-retrieval domain gate and post-retrieval chunk re-scoring mechanism work in tandem to ensure PolicyIQ only responds when sufficient regulatory context exists. This significantly reduces hallucination on out-of-domain queries and maintains the reliability of the system for enterprise use."),
        H2("7.2 Hierarchical Chunking"),
        P("Documents are split using a section-aware hierarchical strategy that respects clause and sub-clause boundaries in regulatory text. This preserves the semantic integrity of individual regulatory statements, leading to more precise retrieval and more accurate answers."),
        H2("7.3 Confidence-Tiered Source Cards"),
        P("Every response in PolicyIQ is accompanied by source cards — visual components that display the originating document, section, page number, and a confidence tier (High / Medium / Low) derived from cosine similarity scores. This allows users to assess the reliability of each answer at a glance and trace every claim to its regulatory source."),
        H2("7.4 8-Turn Conversational Memory"),
        P("PolicyIQ maintains the last 8 turns of conversation history per session. This enables contextual follow-up queries such as \"What are the exceptions to the above rule?\" or \"Which clause covers this for storage tanks specifically?\" — without requiring the user to repeat prior context."),
        H2("7.5 Hindi Translation Toggle"),
        P("A per-message Hindi translation toggle allows users to view any response in Hindi. This improves accessibility for field engineers and non-English-speaking operational staff at IOCL Paradip, making the compliance tool genuinely useful across the workforce."),
        H2("7.6 Curated Typeahead Suggestions"),
        P("The search bar surfaces curated typeahead suggestions powered by a word-based prefix filtering approach. A set of commonly queried regulatory topics is maintained and matched against the user's input in real time, guiding users toward well-formed queries without the overhead of fuzzy matching libraries."),
        H2("7.7 Admin Panel"),
        P("A dedicated admin interface allows document corpus management — including uploading new regulatory PDFs, triggering FAISS re-indexing, and viewing system query logs. This enables the system to be maintained and updated as new regulatory standards are issued."),
        H2("7.8 IOCL-Branded Glassmorphism UI"),
        P("The frontend features a custom glassmorphism design system with IOCL brand colors, an animated mascot on the landing page, and a professional enterprise-grade interface. The UI was designed for internal deployment at IOCL Paradip and was demonstrated to supervisors during the internship."),
        PageBreakP(),

        // CHAPTER 8 – FRONTEND DEVELOPMENT
        H1("CHAPTER 8 – FRONTEND DEVELOPMENT"),
        H2("8.1 Introduction"),
        P("The PolicyIQ frontend was built using React 18, Vite, and Tailwind CSS. It serves as the primary interaction layer — providing the chat interface, source card display, PDF viewer, admin panel, and language toggle. The frontend communicates with the FastAPI backend via REST API calls."),
        H2("8.2 Frontend Structure"),
        MonoLeftP("Frontend/"),
        MonoLeftP("│"),
        MonoLeftP("├── src/"),
        MonoLeftP("│   ├── components/"),
        MonoLeftP("│   │   ├── ChatWindow/"),
        MonoLeftP("│   │   ├── SourceCards/"),
        MonoLeftP("│   │   ├── PDFViewerModal/"),
        MonoLeftP("│   │   ├── AdminPanel/"),
        MonoLeftP("│   │   ├── Typeahead/"),
        MonoLeftP("│   │   └── LanguageToggle/"),
        MonoLeftP("│   │"),
        MonoLeftP("│   ├── pages/"),
        MonoLeftP("│   │   ├── LandingPage/"),
        MonoLeftP("│   │   └── ChatPage/"),
        MonoLeftP("│   │"),
        MonoLeftP("│   ├── services/"),
        MonoLeftP("│   │   └── api.js"),
        MonoLeftP("│   │"),
        MonoLeftP("│   ├── App.jsx"),
        MonoLeftP("│   └── main.jsx"),
        MonoLeftP("│"),
        MonoLeftP("├── index.html"),
        MonoLeftP("└── vite.config.js"),
        H2("8.3 Key UI Components"),
        buildTable(
            ["Component", "Description"],
            [
                ["ChatWindow", "Primary conversational interface with message history, input bar, and send controls"],
                ["SourceCards", "Displays retrieved regulatory chunks with document name, section, page, and confidence tier"],
                ["PDFViewerModal", "In-app PDF viewer with highlighted text passage for cited regulatory sources"],
                ["AdminPanel", "Document upload, FAISS re-indexing trigger, and query log viewer"],
                ["Typeahead", "Word-prefix filtered suggestion dropdown for regulatory query guidance"],
                ["LanguageToggle", "Per-message Hindi translation toggle"],
                ["LandingPage", "IOCL-branded glassmorphism landing page with animated mascot"]
            ],
            [2500, 6500]
        ),
        H2("8.4 Design System"),
        Bullet("Design language: Glassmorphism — frosted glass panels, blur effects, subtle transparency"),
        Bullet("Color palette: IOCL brand colors (deep navy, orange accent) with dark mode base"),
        Bullet("Typography: Clean sans-serif with strong hierarchy for regulatory content readability"),
        Bullet("Responsive layout: Mobile and desktop compatible via Tailwind CSS utility classes"),
        Bullet("Animated mascot on landing page for approachability in an enterprise context"),
        PageBreakP(),

        // CHAPTER 9 – BACKEND & API DESIGN
        H1("CHAPTER 9 – BACKEND & API DESIGN"),
        H2("9.1 Introduction"),
        P("The PolicyIQ backend was developed using FastAPI (Python 3.11). It handles all query processing, RAG pipeline orchestration, FAISS retrieval, LLM integration, conversation memory management, and document corpus administration. The backend exposes a RESTful API consumed by the React frontend."),
        H2("9.2 Backend Structure"),
        MonoLeftP("Backend/"),
        MonoLeftP("│"),
        MonoLeftP("├── app/"),
        MonoLeftP("│   ├── api/"),
        MonoLeftP("│   │   ├── chat.py"),
        MonoLeftP("│   │   ├── admin.py"),
        MonoLeftP("│   │   └── health.py"),
        MonoLeftP("│   │"),
        MonoLeftP("│   ├── core/"),
        MonoLeftP("│   │   ├── rag_pipeline.py"),
        MonoLeftP("│   │   ├── retriever.py"),
        MonoLeftP("│   │   ├── relevance_gate.py"),
        MonoLeftP("│   │   ├── memory.py"),
        MonoLeftP("│   │   └── translator.py"),
        MonoLeftP("│   │"),
        MonoLeftP("│   ├── vectorstore/"),
        MonoLeftP("│   │   ├── faiss_index/"),
        MonoLeftP("│   │   └── embedder.py"),
        MonoLeftP("│   │"),
        MonoLeftP("│   ├── documents/"),
        MonoLeftP("│   └── main.py"),
        MonoLeftP("│"),
        MonoLeftP("├── .env"),
        MonoLeftP("└── requirements.txt"),
        H2("9.3 API Endpoints"),
        buildTable(
            ["Method", "Endpoint", "Purpose"],
            [
                ["POST", "/api/chat", "Process user query through full RAG pipeline, return response + source cards"],
                ["GET", "/api/health", "System health check"],
                ["POST", "/api/admin/upload", "Upload new regulatory PDF to corpus"],
                ["POST", "/api/admin/reindex", "Trigger FAISS re-indexing after new document upload"],
                ["GET", "/api/admin/logs", "Retrieve system query logs"],
                ["POST", "/api/translate", "Translate a response to Hindi"]
            ],
            [1500, 3000, 4500]
        ),
        H2("9.4 Query Processing Flow"),
        Numbered("POST /api/chat receives user query and session conversation history"),
        Numbered("Stage 1 relevance gate evaluates domain relevance — fails gracefully if off-domain"),
        Numbered("Query embedded using all-MiniLM-L6-v2 → top-K chunks retrieved from FAISS index"),
        Numbered("Stage 2 re-scoring filters chunks below cosine similarity threshold"),
        Numbered("Surviving chunks + 8-turn conversation history assembled into structured LLM prompt"),
        Numbered("Prompt dispatched to LLaMA 3.3-70B via Groq API"),
        Numbered("LLM response parsed → confidence tiers assigned to each source chunk"),
        Numbered("JSON response returned to frontend: { answer, sources: [{doc, section, page, confidence}] }"),
        PageBreakP(),

        // CHAPTER 10 – RESULTS AND FINDINGS
        H1("CHAPTER 10 – RESULTS AND FINDINGS"),
        H2("10.1 System Deployment"),
        P("PolicyIQ was successfully developed and deployed as a production-ready full-stack application during the internship period at IOCL Paradip Refinery. The system was demonstrated to supervisors from the IS Department and received positive evaluation as an enterprise-grade compliance assistance tool."),
        H2("10.2 RAG Pipeline Performance"),
        buildTable(
            ["Metric", "Outcome"],
            [
                ["Documents Indexed", "31+ (OISD, PESO, PNGRB, MoPNG)"],
                ["Embedding Model", "all-MiniLM-L6-v2 (384-dim)"],
                ["Vector Index", "FAISS Flat — Cosine Similarity"],
                ["LLM", "LLaMA 3.3-70B via Groq API"],
                ["Relevance Gating", "Two-stage (pre + post retrieval)"],
                ["Conversational Memory", "8-turn session history"],
                ["Hindi Translation", "Per-message toggle"],
                ["Out-of-domain Hallucination", "Significantly reduced via two-stage gating"]
            ],
            [4000, 5000]
        ),
        H2("10.3 Key Findings"),
        Bullet("Two-stage relevance gating effectively filtered out-of-domain queries, preventing the LLM from generating ungrounded responses on non-regulatory topics"),
        Bullet("Hierarchical chunking preserved clause-level semantic integrity, leading to more precise retrieval on specific regulatory queries compared to flat chunking approaches"),
        Bullet("Confidence-tiered source cards significantly improved user trust by making retrieval reliability transparent"),
        Bullet("8-turn conversational memory enabled complex multi-step compliance lookups that would otherwise require multiple separate searches"),
        Bullet("Hindi translation toggle was particularly valued for improving accessibility for non-English-speaking operational staff"),
        Bullet("The curated typeahead system guided users toward effective queries without fuzzy matching overhead"),
        Bullet("IOCL-branded glassmorphism UI was positively received by supervisors and demonstrated suitability for enterprise deployment"),
        H2("10.4 Limitations"),
        Bullet("Retrieval is purely dense (FAISS) — keyword-heavy regulatory queries may benefit from hybrid BM25+FAISS retrieval"),
        Bullet("No automated evaluation harness (RAGAS or equivalent) was implemented during the internship period"),
        Bullet("Cross-encoder reranking was not implemented — retrieval ordering relies solely on cosine similarity"),
        Bullet("System was not connected to live regulatory update feeds; corpus must be manually updated when new standards are issued"),
        PageBreakP(),

        // CHAPTER 11 – CHALLENGES & SOLUTIONS
        H1("CHAPTER 11 – CHALLENGES & SOLUTIONS"),
        buildTable(
            ["Challenge", "Solution"],
            [
                ["Dense regulatory PDFs with inconsistent formatting across OISD, PESO, PNGRB, and MoPNG documents", "PyMuPDF with custom text extraction and cleaning pipeline; section-aware hierarchical chunking to handle structural inconsistencies"],
                ["Off-topic queries causing the LLM to hallucinate regulatory answers", "Two-stage relevance gating: domain filter pre-retrieval + cosine similarity threshold post-retrieval"],
                ["Fixed-size chunking splitting regulatory clauses mid-sentence, degrading retrieval quality", "Hierarchical chunking strategy respecting section and clause boundaries before applying token-level splits"],
                ["Typeahead performance degrading with Fuse.js on large regulatory suggestion lists", "Replaced Fuse.js with a lightweight word-based prefix filter for curated suggestion matching"],
                ["Making the system accessible to non-English-speaking field engineers", "Per-message Hindi translation toggle via secondary LLM call to Groq API"],
                ["PDF viewer needing to highlight the exact cited passage from retrieved chunks", "PDFViewerModal with MutationObserver-based polling, Unicode normalization, Jaccard trigram similarity matching, and span-level word token mapping for robust text highlighting"],
                ["Maintaining answer coherence across multi-turn regulatory conversations", "8-turn in-context conversation history prepended to every LLM prompt"]
            ],
            [4000, 5000]
        ),
        PageBreakP(),

        // CHAPTER 12 – FUTURE SCOPE
        H1("CHAPTER 12 – FUTURE SCOPE"),
        P("PolicyIQ establishes a strong production foundation for AI-powered regulatory compliance. Several enhancements are identified for future versions:"),
        H2("12.1 Hybrid BM25 + FAISS Retrieval"),
        P("Combining BM25 sparse retrieval with FAISS dense retrieval in a hybrid search architecture would improve precision on keyword-heavy regulatory queries where exact clause terminology matters — particularly for numbered standard references (e.g., \"OISD-STD-116\")."),
        H2("12.2 Cross-Encoder Reranking"),
        P("Adding a cross-encoder reranking stage after FAISS retrieval would improve the ordering of retrieved chunks by evaluating query-chunk relevance more precisely than cosine similarity alone. Models like ms-marco-MiniLM cross-encoders are suitable for this use case."),
        H2("12.3 Query Rewriting"),
        P("An LLM-based query rewriting module could expand and clarify ambiguous or underspecified user queries before retrieval — improving recall on vague regulatory questions where the user does not know the exact terminology used in the standard."),
        H2("12.4 RAGAS Evaluation Harness"),
        P("Integrating the RAGAS evaluation framework would enable automated measurement of faithfulness, answer relevance, context precision, and context recall — providing quantitative benchmarks for system improvement over time."),
        H2("12.5 Hallucination Grounding Guardrail"),
        P("A post-generation fact-checking module could verify that each claim in the LLM response is grounded in at least one retrieved chunk before returning the answer to the user, providing an additional safety layer for enterprise compliance use."),
        H2("12.6 Live Regulatory Update Integration"),
        P("Integration with OISD, PESO, and PNGRB document feeds would allow PolicyIQ to automatically detect and ingest newly issued or updated regulatory standards, keeping the corpus current without manual admin intervention."),
        H2("12.7 Multi-Refinery Deployment"),
        P("The architecture is designed to scale. Future versions could support multiple IOCL refinery locations, each with their own document corpus and admin panel, under a centralized PolicyIQ deployment — expanding the tool's value across the organization."),
        PageBreakP(),

        // CHAPTER 13 – CONCLUSION
        H1("CHAPTER 13 – CONCLUSION"),
        P("PolicyIQ demonstrates how Retrieval-Augmented Generation can be practically applied to solve a real-world enterprise problem — making dense, multi-standard regulatory knowledge instantly accessible through a natural language interface."),
        P("Built end-to-end during a summer internship at IOCL Paradip Refinery, the system integrates modern NLP infrastructure — FAISS vector search, HuggingFace sentence embeddings, and LLaMA 3.3-70B via Groq API — with a production-quality full-stack architecture built on FastAPI and React. Key design decisions including two-stage relevance gating, hierarchical chunking, confidence-tiered source cards, and 8-turn conversational memory collectively ensure that PolicyIQ delivers grounded, trustworthy, and contextually coherent regulatory answers."),
        P("The project successfully achieved all stated objectives: 31+ regulatory documents were indexed and made queryable, the system was demonstrated to IS Department supervisors at IOCL Paradip, and the full-stack application was deployed in a production-ready state. The IOCL-branded interface, Hindi translation toggle, and curated typeahead system reflect a deliberate focus on real-world usability for the refinery workforce."),
        P("PolicyIQ lays the groundwork for broader document intelligence systems across the oil and gas sector. With future enhancements including hybrid retrieval, cross-encoder reranking, RAGAS evaluation, and live regulatory update integration, the system is well-positioned to evolve into a comprehensive AI compliance platform for IOCL's operations."),
        PageBreakP(),

        // REFERENCES
        H1("REFERENCES"),
        Numbered("OISD Standards — Oil Industry Safety Directorate, Government of India. Available: https://oisd.nic.in"),
        Numbered("PESO Regulations — Petroleum and Explosives Safety Organisation, Government of India. Available: https://peso.gov.in"),
        Numbered("PNGRB Regulations — Petroleum and Natural Gas Regulatory Board. Available: https://www.pngrb.gov.in"),
        Numbered("MoPNG Directives — Ministry of Petroleum and Natural Gas, Government of India. Available: https://mopng.gov.in"),
        Numbered("Lewis, P., Perez, E., Piktus, A., et al., \"Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks,\" NeurIPS 2020."),
        Numbered("Johnson, J., Douze, M., and Jégou, H., \"Billion-Scale Similarity Search with GPUs,\" IEEE Transactions on Big Data, 2021. (FAISS)"),
        Numbered("Reimers, N. and Gurevych, I., \"Sentence-BERT: Sentence Embeddings using Siamese BERT-Networks,\" EMNLP 2019."),
        Numbered("Touvron, H., et al., \"LLaMA: Open and Efficient Foundation Language Models,\" arXiv:2302.13971, 2023."),
        Numbered("Es, S., James, J., Anke, L. E., and Schockaert, S., \"RAGAS: Automated Evaluation of Retrieval Augmented Generation,\" arXiv:2309.15217, 2023."),
        Numbered("FastAPI Documentation. Available: https://fastapi.tiangolo.com"),
        Numbered("React Documentation. Available: https://react.dev"),
        Numbered("FAISS Documentation — Facebook AI Research. Available: https://faiss.ai"),
        Numbered("HuggingFace Sentence Transformers Documentation. Available: https://www.sbert.net"),
        Numbered("Groq API Documentation. Available: https://console.groq.com/docs"),
        Numbered("LangChain Documentation. Available: https://python.langchain.com"),
        Numbered("PyMuPDF Documentation. Available: https://pymupdf.readthedocs.io"),
        Numbered("Tailwind CSS Documentation. Available: https://tailwindcss.com/docs"),
        Numbered("Indian Oil Corporation Limited (IOCL), Official Website. Available: https://iocl.com"),
        Numbered("Indian Oil Corporation Limited (IOCL), Paradip Refinery. Available: https://iocl.com/pages/paradip-refinery"),
        PageBreakP(),

        // PROJECT REPOSITORY
        H1("PROJECT REPOSITORY"),
        P("The complete source code including FastAPI backend, React frontend, FAISS vector store pipeline, document ingestion scripts, and supporting documentation are available at:"),
        P("GitHub Repository: https://github.com/savya14/policyiq"),
        P("Repository Owner: Savya [Last Name]"),
        P("Project: PolicyIQ — AI-Powered Regulatory Compliance Chatbot for IOCL Paradip Refinery"),
    ];
}

createReport();
