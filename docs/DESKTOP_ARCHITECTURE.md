# Desktop Application Architecture Guide

> A comprehensive guide for building the Procrastination Detection Desktop Application with multi-component ML integration.

## Table of Contents

1. [Overview](#overview)
2. [Tech Stack](#tech-stack)
3. [System Architecture](#system-architecture)
4. [Component Plugin System](#component-plugin-system)
5. [Data Flow](#data-flow)
6. [Project Structure](#project-structure)
7. [Component Integration Guide](#component-integration-guide)
8. [Development Workflow](#development-workflow)
9. [Packaging & Distribution](#packaging--distribution)

---

## Overview

The desktop application serves as the central hub for the procrastination detection research project, integrating:

| Component | Owner | Description |
|-----------|-------|-------------|
| Activity Classification | Component 1 | Classifies browsing activity as academic/non-academic |
| Procrastination Detection | Component 2 | Identifies procrastination levels and active times |
| Intervention System | Component 3 | Triggers interventions when procrastination is detected |
| Task Breakdown | Component 4 | Breaks tasks into smaller pieces based on active times |

All components run within a **single unified backend** using a plugin architecture.

---

## Tech Stack

### Desktop Application Layer

| Technology | Purpose |
|------------|---------|
| **Electron.js** | Cross-platform desktop framework |
| **React + TypeScript** | UI components |
| **Vite** | Build tool and dev server |

### Backend Layer

| Technology | Purpose |
|------------|---------|
| **Python 3.10+** | Backend runtime |
| **FastAPI** | Async REST API framework |
| **scikit-learn** | ML model inference |
| **Pydantic** | Data validation and schemas |
| **SQLAlchemy** | Database ORM |

### Data Layer

| Technology | Purpose |
|------------|---------|
| **SQLite** | Local database |
| **MongoDB Atlas** | Cloud sync (optional) |

### Communication

| Channel | Purpose |
|---------|---------|
| **Native Messaging** | Browser extension <-> Desktop app |
| **HTTP (localhost:8000)** | Electron <-> Python backend |
| **IPC** | Electron main <-> renderer |

---

## System Architecture

```
                    STUDENT'S COMPUTER
    ┌─────────────────────────────────────────────────────────────┐
    │                                                             │
    │  ┌─────────────┐                    ┌────────────────────┐  │
    │  │   Browser   │  Native Messaging  │   Electron App     │  │
    │  │  Extension  │◄──────────────────►│                    │  │
    │  │             │                    │  ┌──────────────┐  │  │
    │  │ - Tracking  │                    │  │  React UI    │  │  │
    │  │ - Events    │                    │  │  - Dashboard │  │  │
    │  └─────────────┘                    │  │  - Settings  │  │  │
    │                                     │  │  - Tasks     │  │  │
    │                                     │  └──────────────┘  │  │
    │                                     │         │          │  │
    │                                     └─────────┼──────────┘  │
    │                                               │             │
    │                                    HTTP localhost:8000      │
    │                                               │             │
    │  ┌────────────────────────────────────────────▼──────────┐  │
    │  │              Python Backend (FastAPI)                 │  │
    │  │                                                       │  │
    │  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────────┐  │  │
    │  │  │ Classif.│→│ Procras.│→│ Interv. │ │ Task Break. │  │  │
    │  │  │   (1)   │ │   (2)   │ │   (3)   │ │     (4)     │  │  │
    │  │  └─────────┘ └─────────┘ └─────────┘ └─────────────┘  │  │
    │  │                        │                              │  │
    │  │                  ┌─────▼─────┐                        │  │
    │  │                  │  SQLite   │                        │  │
    │  │                  └───────────┘                        │  │
    │  └───────────────────────────────────────────────────────┘  │
    │                                                             │
    └─────────────────────────────────────────────────────────────┘
```

---

## Component Plugin System

### Why a Single Backend?

Instead of each team member creating a separate backend service, all components integrate into one Python application:

| Benefit | Description |
|---------|-------------|
| **Simple Deployment** | One executable to distribute |
| **Shared Data** | All components access the same database |
| **Direct Communication** | Components call each other via Python imports |
| **Resource Efficient** | Single process, no inter-process overhead |

### Component Interface

Every component must implement this base interface:

```python
# backend/app/components/base.py
from abc import ABC, abstractmethod
from typing import Any, Dict, List

class ComponentBase(ABC):
    """Base class all research components must inherit"""

    @property
    @abstractmethod
    def name(self) -> str:
        """Unique component identifier (e.g., 'classification')"""
        pass

    @property
    @abstractmethod
    def version(self) -> str:
        """Component version (e.g., '1.0.0')"""
        pass

    @property
    @abstractmethod
    def dependencies(self) -> List[str]:
        """Names of components this depends on (empty if none)"""
        pass

    @abstractmethod
    def initialize(self, config: Dict[str, Any]) -> None:
        """Called once on application startup. Load models here."""
        pass

    @abstractmethod
    def process(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Main processing method. Receives input, returns output."""
        pass

    @abstractmethod
    def get_status(self) -> Dict[str, Any]:
        """Health check - return model status, version, etc."""
        pass
```

### Component Registry

Components discover and call each other through a central registry:

```python
# backend/app/core/component_registry.py
class ComponentRegistry:
    """Singleton registry for component discovery and invocation"""

    _instance = None
    _components: dict = {}

    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            cls._instance = ComponentRegistry()
        return cls._instance

    def register(self, component: ComponentBase):
        self._components[component.name] = component

    def get(self, name: str) -> ComponentBase:
        return self._components.get(name)

    def call(self, component_name: str, data: dict) -> dict:
        """Invoke any component by name"""
        component = self.get(component_name)
        if not component:
            raise ValueError(f"Component '{component_name}' not found")
        return component.process(data)
```

---

## Data Flow

### Pipeline Execution

```
Browser Activity
       │
       ▼
┌──────────────────┐
│   Component 1    │ Input:  { domain, url, title, time_spent }
│  Classification  │ Output: { category, confidence, source }
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│   Component 2    │ Input:  { activity, classification }
│  Procrastination │ Output: { level, active_times, should_intervene }
└────────┬─────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌────────┐ ┌────────────┐
│ Comp 3 │ │  Comp 4    │
│ Interv.│ │ Task Break │
└────────┘ └────────────┘
```

### Data Schemas

Define clear input/output contracts using Pydantic:

```python
# backend/app/components/classification/schemas.py
from pydantic import BaseModel

class ClassificationInput(BaseModel):
    domain: str
    url: str
    title: str
    time_spent: int  # seconds

class ClassificationOutput(BaseModel):
    category: str      # 'academic', 'productivity', 'neutral', 'non_academic'
    confidence: float  # 0.0 to 1.0
    source: str        # 'database', 'rules', 'model'
```

```python
# backend/app/components/procrastination/schemas.py
from pydantic import BaseModel
from typing import List, Optional

class ActiveTimePeriod(BaseModel):
    start_hour: int
    end_hour: int
    productivity_score: float

class ProcrastinationInput(BaseModel):
    activity: dict
    classification: dict

class ProcrastinationOutput(BaseModel):
    level: str  # 'low', 'medium', 'high'
    confidence: float
    active_times: List[ActiveTimePeriod]
    should_intervene: bool
    recommended_break: Optional[int]  # minutes
```

---

## Project Structure

```
desktop-app/
│
├── electron/                      # Electron application
│   ├── main/
│   │   ├── index.ts               # Main process entry
│   │   ├── native-messaging.ts    # Browser extension comms
│   │   ├── python-bridge.ts       # Backend HTTP client
│   │   └── tray.ts                # System tray
│   ├── renderer/
│   │   ├── src/
│   │   │   ├── components/
│   │   │   ├── pages/
│   │   │   └── App.tsx
│   │   └── index.html
│   ├── preload/
│   │   └── index.ts
│   └── package.json
│
├── backend/                       # Python FastAPI backend
│   ├── app/
│   │   ├── main.py                # FastAPI entry point
│   │   ├── core/
│   │   │   ├── config.py          # App configuration
│   │   │   ├── database.py        # SQLite connection
│   │   │   ├── component_registry.py
│   │   │   └── pipeline.py        # Component orchestration
│   │   │
│   │   ├── components/            # ML Components (plugins)
│   │   │   ├── __init__.py
│   │   │   ├── base.py            # ComponentBase class
│   │   │   │
│   │   │   ├── classification/    # COMPONENT 1
│   │   │   │   ├── __init__.py
│   │   │   │   ├── component.py
│   │   │   │   ├── model.py
│   │   │   │   └── schemas.py
│   │   │   │
│   │   │   ├── procrastination/   # COMPONENT 2
│   │   │   │   ├── __init__.py
│   │   │   │   ├── component.py
│   │   │   │   ├── model.py
│   │   │   │   └── schemas.py
│   │   │   │
│   │   │   ├── intervention/      # COMPONENT 3
│   │   │   │   └── ...
│   │   │   │
│   │   │   └── task_breakdown/    # COMPONENT 4
│   │   │       └── ...
│   │   │
│   │   ├── api/                   # REST endpoints
│   │   │   ├── activity.py
│   │   │   ├── components.py
│   │   │   └── dashboard.py
│   │   │
│   │   └── models/                # SQLAlchemy models
│   │       └── schemas.py
│   │
│   ├── models/                    # Trained ML models (.pkl)
│   │   ├── classification.pkl
│   │   ├── procrastination.pkl
│   │   ├── intervention.pkl
│   │   └── task_breakdown.pkl
│   │
│   ├── requirements.txt
│   └── pyproject.toml
│
├── shared/
│   └── schemas/
│       └── events.json            # Shared JSON schemas
│
└── package.json                   # Root workspace
```

---

## Component Integration Guide

### For Team Members: How to Add Your Component

#### Step 1: Create Your Component Folder

```
backend/app/components/your_component/
├── __init__.py
├── component.py    # Main component class
├── model.py        # ML model loading/inference
└── schemas.py      # Pydantic input/output schemas
```

#### Step 2: Implement the Component Interface

```python
# backend/app/components/procrastination/component.py
from app.components.base import ComponentBase
from app.core.component_registry import ComponentRegistry
import joblib
from pathlib import Path

class ProcrastinationComponent(ComponentBase):

    @property
    def name(self) -> str:
        return "procrastination"

    @property
    def version(self) -> str:
        return "1.0.0"

    @property
    def dependencies(self) -> list[str]:
        return ["classification"]  # Runs after classification

    def initialize(self, config: dict) -> None:
        # Load your trained model
        model_path = Path(__file__).parent.parent.parent.parent / "models"
        self.model = joblib.load(model_path / "procrastination.pkl")

    def process(self, data: dict) -> dict:
        # Get classification if not provided
        if 'classification' not in data:
            registry = ComponentRegistry.get_instance()
            data['classification'] = registry.call('classification', data['activity'])

        # Your ML prediction logic
        features = self._extract_features(data)
        level = self.model.predict([features])[0]
        proba = self.model.predict_proba([features])[0]

        return {
            'level': level,
            'confidence': float(max(proba)),
            'active_times': self._calculate_active_times(data),
            'should_intervene': level == 'high'
        }

    def get_status(self) -> dict:
        return {
            'name': self.name,
            'version': self.version,
            'model_loaded': self.model is not None
        }

    def _extract_features(self, data: dict) -> list:
        # Convert input data to feature vector
        # ... your feature extraction logic
        pass

    def _calculate_active_times(self, data: dict) -> list:
        # Analyze activity patterns
        # ... your active time calculation
        pass
```

#### Step 3: Register Your Component

```python
# backend/app/components/__init__.py
from .classification import ClassificationComponent
from .procrastination import ProcrastinationComponent
from .intervention import InterventionComponent
from .task_breakdown import TaskBreakdownComponent

COMPONENTS = {
    'classification': ClassificationComponent,
    'procrastination': ProcrastinationComponent,
    'intervention': InterventionComponent,
    'task_breakdown': TaskBreakdownComponent,
}

def load_all_components(config: dict):
    """Initialize all components on startup"""
    from app.core.component_registry import ComponentRegistry
    registry = ComponentRegistry.get_instance()

    for name, ComponentClass in COMPONENTS.items():
        component = ComponentClass()
        component.initialize(config)
        registry.register(component)
```

#### Step 4: Add Your Model File

Place your trained scikit-learn model at:
```
backend/models/your_component.pkl
```

Save your model using:
```python
import joblib
joblib.dump(trained_model, 'your_component.pkl')
```

---

## Development Workflow

### Initial Setup

```bash
# Clone the repository
git clone <repository-url>
cd desktop-app

# Install Electron dependencies
cd electron
npm install

# Create Python virtual environment
cd ../backend
python -m venv venv
venv\Scripts\activate  # Windows
pip install -r requirements.txt
```

### Running in Development

**Terminal 1: Python Backend**
```bash
cd backend
venv\Scripts\activate
uvicorn app.main:app --reload --port 8000
```

**Terminal 2: Electron App**
```bash
cd electron
npm run dev
```

### Testing Your Component

```python
# test_your_component.py
from app.components.your_component import YourComponent

component = YourComponent()
component.initialize({})

result = component.process({
    'activity': {'domain': 'youtube.com', 'time_spent': 3600},
    'classification': {'category': 'non_academic', 'confidence': 0.9}
})

print(result)
```

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/activity` | POST | Submit browser activity |
| `/api/pipeline/run` | POST | Run full component pipeline |
| `/api/components/{name}/status` | GET | Get component status |
| `/api/components/{name}/process` | POST | Run single component |
| `/api/dashboard/summary` | GET | Get dashboard data |

---

## Packaging & Distribution

### Building for Production

**Step 1: Bundle Python with PyInstaller**

```bash
cd backend
pip install pyinstaller
pyinstaller --onefile --add-data "models;models" app/main.py
```

This creates `dist/main.exe` with all models bundled.

**Step 2: Configure Electron Builder**

```javascript
// electron/electron-builder.config.js
module.exports = {
  appId: 'com.research.procrastination-detector',
  productName: 'Procrastination Detector',
  win: {
    target: 'nsis',
    icon: 'assets/icon.ico'
  },
  extraResources: [
    {
      from: '../backend/dist/main.exe',
      to: 'backend/main.exe'
    }
  ],
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true
  }
}
```

**Step 3: Build Installer**

```bash
cd electron
npm run build
```

### How It Works in Production

1. Electron app starts
2. Main process spawns `backend/main.exe` as subprocess
3. Backend serves API on localhost:8000
4. Electron UI communicates via HTTP
5. On app close, backend subprocess is terminated

```typescript
// electron/main/index.ts
import { spawn } from 'child_process';
import path from 'path';

let backendProcess: ChildProcess;

app.on('ready', () => {
  // Start Python backend
  const backendPath = path.join(process.resourcesPath, 'backend', 'main.exe');
  backendProcess = spawn(backendPath);

  backendProcess.stdout.on('data', (data) => {
    console.log(`Backend: ${data}`);
  });
});

app.on('quit', () => {
  if (backendProcess) {
    backendProcess.kill();
  }
});
```

---

## Quick Reference

### Component Checklist

- [ ] Implement `ComponentBase` interface
- [ ] Define Pydantic schemas for input/output
- [ ] Load model in `initialize()`
- [ ] Implement prediction logic in `process()`
- [ ] Add status info in `get_status()`
- [ ] Register in `components/__init__.py`
- [ ] Place model file in `backend/models/`
- [ ] Write unit tests

### Key Files to Modify

| When you want to... | Modify this file |
|---------------------|------------------|
| Add a new component | `backend/app/components/` |
| Add an API endpoint | `backend/app/api/` |
| Change component order | `backend/app/core/pipeline.py` |
| Update shared schemas | `shared/schemas/` |
| Modify UI | `electron/renderer/src/` |

### Common Commands

```bash
# Run tests
cd backend && pytest

# Format code
black backend/

# Type check
mypy backend/

# Build for production
npm run build:all
```

---

## Support

For questions about:
- **Component interface**: See `backend/app/components/base.py`
- **Data schemas**: See `backend/app/components/*/schemas.py`
- **API endpoints**: See `backend/app/api/`
- **Browser extension**: See `docs/Markdowns/` folder
