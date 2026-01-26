# Atlas DB

Atlas DB is a lightweight, self-hosted knowledge base built for teams that want a fast, modern wiki without the clutter. It combines a clean Markdown editor with powerful navigation and search, plus simple backup and restore to keep everything safe. Your content lives as plain .md files on disk—easy to edit, version, and sync—while a small companion database handles indexing and workspace features like history, navigation, and settings.

## Features

- Guided first-run setup to configure your workspace in minutes
- Organized spaces for published, featured, unlisted, and draft documents
- Markdown editor for creating and editing documents, with wiki-style features
- Dual-pane editing, plus a separate full-screen reader mode experience
- Document history tools with diffs, version browsing, and easy rollback
- Presence indicators to see who’s online and who’s viewing the same document
- Workspace settings and user management, including workspace title/icon controls
- Built-in backups to create and restore backups from the app

## Tech Stack

- **Frontend:** React + Vite  
- **Backend:** Go + SQLite
- **Data:** Markdown files on disk
- **Editor:** Markdown-powered (CodeMirror)  

## Getting Started

### Prerequisites

- Go
- Node.js

### Run locally

The easiest way to start Atlas DB in development is:

```powershell
./start.ps1
