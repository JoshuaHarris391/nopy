# Nopy Documentation

## Purpose

This folder contains all project documentation for Nopy. Its primary goal is to make the codebase **accessible to every contributor**, regardless of their background with web development.

## Folder Structure

```
docs/
├── README.md          ← You are here — overview and writing guidelines
└── noobStack/         ← Guides for contributors new to React / Vite / TypeScript
    ├── README.md
    ├── getting-started.md
    ├── project-structure.md
    ├── editing-code.md
    └── concepts.md
```

## Who Are These Docs For?

The target reader is a **data engineer** who is proficient in Python and comfortable with things like pip, virtual environments, and CLI tools — but has little or no experience with:

- JavaScript / TypeScript
- React (component-based UIs)
- Vite (build tooling)
- npm (package management)

Every doc should meet this reader where they are.

## Writing Guidelines

When contributing or updating documentation in this folder, follow these rules:

### 1. Use Python Analogies

Whenever introducing a new concept, relate it to something the reader already knows. For example:

> "`npm install` is like `pip install -r requirements.txt` — it reads `package.json` (the equivalent of `requirements.txt`) and installs everything listed."

### 2. Explain the "Why", Not Just the "How"

Don't just list commands. Explain what they do and why you'd use them. A data engineer is used to understanding pipelines end-to-end; give them the same clarity here.

### 3. Keep It Concise

Use short paragraphs, bullet points, and code blocks. Avoid walls of text. If a topic is large, split it into its own file.

### 4. Use Headings and Structure

Every doc should have:

- A top-level `# Title`
- A brief one-liner explaining what this doc covers
- Logical `##` sections

### 5. Include Runnable Examples

Where possible, include exact terminal commands or code snippets that the reader can copy-paste and run.

### 6. Keep Docs Up to Date

If you change project structure, dependencies, or scripts, update the relevant doc in the same PR/commit.
