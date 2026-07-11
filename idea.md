# BHARATFLOW ENGINE - Comprehensive System Reference Manual

*Document Class: Production Specification & Core Architecture Reference*

---

## 1. Executive Summary & The Human Context

### The Challenge

Traditional digital marketing infrastructure is built for corporations with dedicated creative agencies, data analysts, and large budgets. For millions of Indian micro-merchants (**Rahuls**) and local logistics operators (**Raghus**), setting up ad accounts, navigating dashboards, and designing custom video assets is a non-starter. They rely entirely on organic local discovery networks—WhatsApp Status updates, Instagram Reels, Facebook Marketplace, and Google Maps location markers.

Furthermore, generic city-wide advertising is ineffective for local stores. A geographic shift of just two kilometers in an Indian market center can mean completely different dialects, local slang, shopping habits, and demographic demands.

### The Solution: BharatFlow Engine

BharatFlow eliminates the user interface entirely, replacing complex dashboards with a single, live, fluid conversation. Pointing a smartphone camera at an item and talking naturally triggers a secure backend multi-agent swarm that aggregates local context, handles creative asset design, generates localized video, and coordinates nearby delivery drivers.

---

## 2. High-Level System Architecture Specification

The system shifts away from traditional request-response structures by utilizing a completely decoupled **Twin-Plane Architecture** managed by a Node.js Meta Orchestrator.

```text
=======================================================================================================================
                                      BHARATFLOW ENGINE: CORE TOPOLOGY MAP
=======================================================================================================================

    [ SYNCHRONOUS PRODUCTION PLANE ]                 [ ASYNCHRONOUS CONTROL PLANE ]
 ┌──────────────────────────────────┐                 ┌─────────────────────────────────────┐
 │    React Mobile UI App Canvas    │                 │    ANTIGRAVITY MANAGED AGENTS       │
 │  (HTML5 Video/Audio Audio Buff)  │                 │    (Remote Linux Sandbox Enclave)   │
 └───────────────┬──────────────────┘                 └──────────────────┬──────────────────┘
                 │                                                       │
        (1 FPS Video / 16kHz PCM)                                (Background Signals)
                 │                                                       │
                 ▼                                                       ▼
 ┌──────────────────────────────────────────────────────────────────────────────────────────┐
 │                                    META ORCHESTRATOR                                     │
 │             (Node.js Server Event Loop, Session Lifecycle & Token Sync [iAPI Engine])     │
 └───────────────────────────────────────────────┬──────────────────────────────────────────┘
                                                 │
                                 (Pushes Consolidated Context)
                                                 │
                                                 ▼
 ┌──────────────────────────────────────────────────────────────────────────────────────────┐
 │                                 CREATIVE DIRECTOR AGENT                                  │
 │                          (Prompt Architect, Live Intercept Router)                       │
 └───────▲───────────────────────────────────────┬───────────────────────────────────▲──────┘
         │                                       │                                   │
  (Reads Manifest /                              │ (Orchestrated Prompt Matrix)      │ (Pipes Live Edits /
   Context Inputs)                               │                                   │  Interruption Tokens)
         │                                       ▼                                   │
 ┌───────┴────────────────────────┐       ┌──────────────┐     ┌─────────────────────┐       │
 │      SHARED WORKSPACE BUS      │       │ NANO BANANA  │     │  GEMINI OMNI FLASH  │       │
 │   (session_manifest.json)      │       │ 2 LITE (NB2) │     │ (Multi-Turn Video)  │       │
 └────────────────────────────────┘       └──────┬───────┘     └──────────┬──────────┘       │
                                                 │                        │                  │
                                            (1K Banners /            (9:16 Streaming         │
                                             Frames Fleet)            Reel Video Chunks)     │
                                                 │                        │                  │
                                                 ▼                        ▼                  │
                                          ┌──────────────────────────────────┐               │
                                          │ GEMINI 3.5 FLASH RUNTIME SUPERVISOR               │──────┘
                                          │   (Visual QA & Automated Fixes)  │
                                          └──────────────┬───────────────────┘
                                                         │
                                               (Approved Media Flows)
                                                         │
                                                         ▼
=======================================================================================================================
                                      OMNICHANNEL DISTRIBUTION & DISCOVERY
=======================================================================================================================
                                                         │
             ┌────────────────────────┬──────────────────┴───────────────────┬────────────────────────┐
             ▼                        ▼                                      ▼                        ▼
  ┌─────────────────────┐  ┌─────────────────────┐                ┌─────────────────────┐  ┌─────────────────────┐
  │  WHATSAPP BUSINESS  │  │     INSTAGRAM       │                │      FACEBOOK       │  │    GOOGLE MAPS      │
  │     ENDPOINT        │  │  REGIONAL REELS     │                │     MARKETPLACE     │  │     & SEARCH        │
  ├─────────────────────┤  ├─────────────────────┤                ├─────────────────────┤  ├─────────────────────┤
  │ Click-to-Chat deep  │  │ 5s Bumper Video     │                │ Direct Automated    │  │ Highlighted Proximity│
  │ links pushed straight│  │ Targeting within a  │                │ Listing creation for│  │ Pin updates along   │
  │ to client drafts.   │  │ 1km cellular grid.  │                │ hyper-local stock.  │  │ gridlocked traffic. │
  └─────────────────────┘  └─────────────────────┘                 └─────────────────────┘  └─────────────────────┘

```

---

## 3. Antigravity Managed Agent Enclave (`iAPI`)

The background curation layer operates inside an isolated, stateful Linux sandbox container managed by the **Interactions API (`antigravity-preview-05-2026`)**. The environment runs asynchronously via Node.js system hooks, allowing sub-agents to collaborate using a local **Blackboard Design Pattern**.

### Sub-Agent Roles & Internal Collaboration

Rather than operating in isolated sequences, the three agents communicate by reading and writing updates to a single shared file (`session_manifest.json`) within the container:

```text
  ┌────────────────────────────────────────────────────────────────────────┐
  │                   REMOTE LINUX SANDBOX CONTAINER (iAPI)                │
  │                                                                        │
  │                    ┌──────────────────────────────┐                    │
  │                    │     SHARED BLACKBOARD BUS    │                    │
  │                    │    (session_manifest.json)   │                    │
  │                    └──────────────▲───────────────┘                    │
  │                                   │                                    │
  │         ┌─────────────────────────┼─────────────────────────┐          │
  │         ▼                         ▼                         ▼          │
  ┌───────────────────┐     ┌───────────────────┐     ┌────────────────────┐       │
  │  AGENT A: SCOUT   │     │ AGENT B: ARCHIVIST│     │ AGENT C: STRATEGIST│       │
  │ (Geo/Weather/Web) │     │ (World Vibe Synth)│     │ (Slang & Keywords) │       │
  └───────────────────┘     └───────────────────┘     └────────────────────┘       │
  └────────────────────────────────────────────────────────────────────────┘

```

* **Agent A (The Geo Scout):** Tracks ambient local metrics, scraping event sites, calendars, and local weather tables. *(Writes to manifest: High density gathering at nearby street market, sudden rain forecast).*
* **Agent B (The Creative Archivist):** Evaluates Agent A's signals and applies Gemini's world knowledge to synthesize a dynamic visual design layout matching the product type and local weather (e.g. tropical vibes for hot days, warm colors for cold days) instead of using hardcoded templates.
* **Agent C (The Slang Strategist):** Monitors neighborhood social activity and competitor storefronts, pulling high-resonance local slangs and idioms. *(Writes to manifest: Overriding formal copy blocks with region-specific tags like 'Machan' or 'Gethu').*

---

## 4. System Prompt Specifications

### A. The Antigravity Sandbox Swarm Prompt

This prompt coordinates the collaborative blackboard behavior inside the `antigravity-preview-05-2026` execution container:

```text
Context Flag: System Container Initialization Engine
Target Environment: Remote Linux Sandbox
Core Task: Multi-Agent Localized Trend Analysis

You are the Federated Swarm Coordinator governing three internal execution tasks. You have access to the google_search grounding tool. Read and write your progress parameters to the shared memory object 'session_manifest.json'.

Perform the following system iterations:
1. Initialize Agent A (The Geo Scout): Query the search tool using the target coordinates and business category. Identify immediate local events, college festivals, neighborhood sports matches, and localized weather fluctuations happening within a 2-kilometer grid today.
2. Initialize Agent B (The Creative Archivist): Analyze Agent A's findings. Synthesize the optimal design theme, color palettes, and visual layout instructions dynamically using world knowledge matching the current environmental vibe and target product.
3. Initialize Agent C (The Slang Strategist): Scan nearby public business markers and social feeds. Extract highly active regional slangs, localized keywords, and popular idioms unique to this specific market zone.

Consolidate all values into a single, clean JSON string containing exclusively the keys:
'local_event', 'environmental_trigger', 'neighborhood_slangs', and 'recommended_copy_strategy'.

Constraint Check: Do not include markdown code wrappers (e.g., ```json) or any conversational text strings. Output only the raw valid JSON payload.

```

### B. The Creative Director Prompt (The Production Translator)

This prompt runs on the Node.js plane, combining the swarm's manifest files with the user's voice directions to generate prompts for the media models:

```text
Context Flag: Creative Director Interface Core
Inputs: User Voice/Video Chunks, Background Swarm Manifest
Target Output: System Prompts for Media Models

You are the Lead Creative Director. You translate unstructured real-time human intentions and hyper-local context arrays into structural instructions for production media engines.

Analyze these input signals:
- Swarm Manifest: {swarm_manifest_data}
- User Video/Image Input: {raw_camera_frame}
- User Verbal Adjustment: {user_voice_instruction}

Execute the following prompt generation forks:
1. For Nano Banana 2 Lite (Graphic Layout Render): Construct an explicit prompt directing the image generator to render a 1K studio-quality advertisement. Require the model to isolate the primary product geometry and use its typographic engine to cleanly overlay the manifest's 'recommended_copy_strategy' text, natively incorporating regional script elements and neighborhood slang tokens without character clipping.
2. For Gemini Omni Flash (Cinematic Motion Timeline): Construct a conversational prompt instructing the video engine to animate the image asset into a 9:16 vertical layout. Specify camera motion vectors (panning, tracking), lighting transformations matching the local environment, and short-form video edit transitions. Incorporate any adjustments from the user's verbal instruction instantly.

```

### C. The Gemini 3.5 Flash Runtime Supervisor Prompt

This prompt runs in the background to ensure quality and compliance before the assets are deployed:

```text
Context Flag: Runtime Visual Quality & Compliance Audit
Target Model: gemini-3.5-flash
Core Task: Visual Verification Loop

You are the Automated Production Supervisor. Analyze the incoming media generation frame against the target marketing strategy constraints.

Inputs to Verify:
- Swarm Strategy Matrix: {swarm_manifest_copy}
- Rendered Asset Frame: {raw_media_frame_base64}

Perform the following real-time verification checks:
1. Typography Contrast Audit: Is the overlaid text completely readable against the generated background details and lighting? If the background colors decrease text contrast, flag it immediately.
2. Structural Layout Check: Is the primary product clearly visible and un-obscured? Are all characters within the screen boundaries without text overlaps?

Output exactly a JSON object string containing two keys: 'compliant' (boolean) and 'required_adjustments' (a clear string instruction for the asset engine if issues are found, otherwise null). Do not include any text outside this JSON wrapper.

```

---

## 5. Multi-Stream Media Deliverables & Channels

Once the Creative Director processes the data, it forks the media production into **three distinct deliverables** tailored to the business needs:

```text
[Unified Context Manifest] ──> [Creative Director Agent]
                                        │
           ┌────────────────────────────┼────────────────────────────┐
           ▼                            ▼                            ▼
┌───────────────────────┐   ┌───────────────────────┐   ┌───────────────────────┐
│     1. STILL ADS      │   │     2. MOTION ADS     │   │   3. CINEMATIC ADS    │
├───────────────────────┤   ├───────────────────────┤   ├───────────────────────┤
│ Target Engine:        │   │ Target Engine:        │   │ Target Engine:        │
│ Nano Banana 2 Lite    │   │ NB2 Lite Frame Loop   │   │ Gemini Omni Flash     │
├───────────────────────┤   ├───────────────────────┤   ├───────────────────────┤
│ High-res 1K graphic   │   │ Compiles sequential   │   │ Renders 9:16 vertical │
│ banners with native   │   │ graphic adjustments   │   │ video reels with      │
│ typographic layouts   │   │ into lightweight,     │   │ conversational style  │
│ rendered in sub-4s.   │   │ looping GIFs/MP4s.    │   │ and element swapping. │
└───────────────────────┘   └───────────────────────┘   └───────────────────────┘

```

### The Omnichannel Distribution Grid

The Node.js server receives the verified deliverables from the supervisor and deploys them to local discovery networks via enterprise APIs:

* **WhatsApp Business API:** Sends personalized motion ads and deep links into customer chat matrices, dropping buyers straight into a pre-filled chat conversation (*"Hi Rahul, save me one order of this!"*).
* **Meta Graph API (Instagram Reels / FB Marketplace):** Posts the cinematic 9:16 vertical videos directly to regional feeds, applying targeted hashtag swarms based on local landmarks to maximize organic discovery.
* **Google Ads & My Business API:** Dynamically updates location description metrics and highlights proximity pins on Google Maps along high-traffic routes to capture foot traffic.

---

## 6. Point-Turn Live Session Lifecycle & State Engine

The core interaction engine relies on a full-duplex WebSocket connection managed by the Node.js server. The application tracks explicit state shifts to handle **Barge-In (Voice Interruption)** commands smoothly:

```text
[Omni Flash Reel Output Streaming to Client]
                     │
    (Rahul interrupts: "Stop! Make the background lighting blue.")
                     │
                     ▼
┌───────────────────────────────────────────────────────┐
│ 1. ADK VOICE ACTIVITY DETECTION (VAD) INTERCEPT       │
│ - Live Agent gateway flags 'serverContent.interrupted'│
│ - Meta Orchestrator shifts state to BARGE_IN_FREEZE.  │
└───────────────────┬───────────────────────────────────┘
                    │
                    ▼
┌───────────────────────────────────────────────────────┐
│ 2. IMMEDIATE CLIENT DISPATCH                          │
│ - Local app flushes its audio playback buffer.        │
│ - HTML5 video freezes; applies neon blur outline.     │
└───────────────────┬───────────────────────────────────┘
                    │
                    ▼
┌───────────────────────────────────────────────────────┐
│ 3. CREATIVE DIRECTOR UPDATE CHAIN                     │
│ - Translates raw voice text into code parameters.     │
│ - Instructs Omni Flash: "Halt path. Shift tint color".│
└───────────────────┬───────────────────────────────────┘
                    │
                    ▼
┌───────────────────────────────────────────────────────┐
│ 4. CYCLE RESET                                        │
│ - 3.5 Flash supervisor verifies font contrast safety. │
│ - Video stream path resumes down the active socket.   │
└───────────────────────────────────────────────────────┘

```

### Core WebSocket Data Event Contracts

* `ActivityStart` / VAD Trigger: The system transitions to `USER_TURN`, muting ongoing speech generation and opening the input buffers.
* `serverContent.interrupted: true`: Signals a user barge-in event. The Node.js server flushes its local output cache, while the client app halts the media player instantly to prevent overlapping audio.
* `inputTranscription`: Delivers the raw text token string from the user's voice message straight to the Creative Director Agent to adjust the prompt models.
* `generationComplete`: Signals that the creative modification cycle is complete and updates the React mobile UI canvas.

---

## 7. Performance Optimization & Latency Mitigation Plan

To support thousands of concurrent local businesses without facing server lag or api timeouts, the system design implements three critical engineering strategies:

1. **Implicit Token Cache Optimization:** The Node.js server retains historical conversation context by passing the `previous_interaction_id` parameter to the Google GenAI SDK. This avoids re-sending heavy visual metadata blocks over the network, achieving a **90% token cache hit ratio** and dropping round-trip interaction latency down to millisecond thresholds.
2. **Decoupled Multi-Tier Processing:** The platform isolates the fast, high-volume graphic generation lines (**Still and Motion Ads via NB2 Lite**) from the slower, complex video creation engine (**Omni Flash**). The user receives immediate visual confirmation from the fast graphic cards while the heavy video files compile cleanly in the background.
3. **Context Collapse Guardrails:** To prevent large conversation histories from causing system lag during long editing sessions, the Meta Orchestrator enforces a strict **three-turn limits rule** per active editing stream. On the third consecutive voice adjustment, the system collapses the session history and bakes the modifications permanently into a new baseline file, resetting the tracking parameters back to zero.