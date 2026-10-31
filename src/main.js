import '@fortawesome/fontawesome-free/css/all.css';
// The new look (stage 1). Remove this line and src/look.css for the classic look.
import './look.css';
import gifshot from 'gifshot';
import JSZip from 'jszip';

window.gifshot = gifshot;

const LONG_GIF_FRAME_THRESHOLD = 150;
const BACKGROUND_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const BACKGROUND_IMAGE_MAX_PIXELS = 16_000_000;
// Undo snapshots store each frame once and reuse unchanged frames, so a long
// history stays small.
const HISTORY_LIMIT = 100;
// Bump when the What's new notes change, so the dot shows again.
const WHATS_NEW_VERSION = '2026-10-31c';
const GUIDE_KEY = 'motionSketchGuide';
const ONION_BEFORE_TINT = '#2f6bff';
const ONION_AFTER_TINT = '#19a35b';
const LOOP_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12"/><path d="M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/></svg>';
const PLAY_ONCE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12h13"/><path d="M11 7l5 5-5 5"/><path d="M20 5v14"/></svg>';

        class IDBHelper {
            constructor(dbName, storeName) {
                this.dbName = dbName;
                this.storeName = storeName;
                this.db = null;
            }
            async init() {
                return new Promise((resolve, reject) => {
                    const request = indexedDB.open(this.dbName, 1);
                    request.onupgradeneeded = (e) => {
                        const db = e.target.result;
                        if (!db.objectStoreNames.contains(this.storeName)) {
                            db.createObjectStore(this.storeName);
                        }
                    };
                    request.onsuccess = (e) => { this.db = e.target.result; resolve(); };
                    request.onerror = (e) => reject(e);
                });
            }
            async set(key, value) {
                if (!this.db) await this.init();
                return new Promise((resolve, reject) => {
                    const tx = this.db.transaction(this.storeName, 'readwrite');
                    const store = tx.objectStore(this.storeName);
                    const req = store.put(value, key);
                    req.onsuccess = () => resolve();
                    req.onerror = (e) => reject(e);
                });
            }
            async get(key) {
                if (!this.db) await this.init();
                return new Promise((resolve, reject) => {
                    const tx = this.db.transaction(this.storeName, 'readonly');
                    const store = tx.objectStore(this.storeName);
                    const req = store.get(key);
                    req.onsuccess = () => resolve(req.result);
                    req.onerror = (e) => reject(e);
                });
            }
        }

        class MotionSketchVector {
            constructor() {
                this.canvas = document.getElementById('rendering-canvas');
                this.bgCanvas = document.getElementById('background-canvas');
                this.canvasWrapper = document.getElementById('canvas-wrapper');
                this.cursorEl = document.getElementById('brush-cursor');
                this.ctx = this.canvas.getContext('2d');
                this.bgCtx = this.bgCanvas.getContext('2d');
                this.framesList = document.getElementById('frames-list');
                this.frames = [{ strokes: [], paperStrokes: [], hold: 1 }];
                this.paperStrokes = [];
                this.motionTracks = [];
                this.motionTrackCounter = 0;
                this.truckSelectedTrackId = null;
                this.truckEndFrame = 1;
                this.keyBadgeDrag = null;
                this.pathKeyDrag = null;
                this.pathHover = null;
                this.motionDragSaved = false;
                this.motionDirectEditDirty = false;
                this.frameIndex = 0;

                this.activeLayer = 'ink';
                this.backgroundLocked = false;
                this.backgroundHidden = false;
                this.tool = 'brush';
                this.brushType = 'brush';

                this.brushColor = '#000000';
                this.brushSize = 10;
                this.opacity = 1.0;

                this.isDrawing = false;
                this.currentStroke = null;
                this.quickLineTimer = null;
                this.quickLineActive = false;
                this.quickLineDelay = 550;
                this.quickLineMinDistance = 12;
                this.frameAddPulseTimer = null;
                this.frameAddedTimer = null;

                this.selectedObject = null;
                this.selectedBgColor = '#ffffff';
                this.dragMode = null;
                this.snapToGrid = false;
                this.snapSize = 10;
                this.showGrid = false;
                this.symmetryEnabled = false;
                this.referenceImage = null;
                this.backgroundImage = null;
                this.backgroundImageCache = new Map();
                this.backgroundImageDraft = null;
                this.backgroundImageRequest = 0;
                this.projectLoadRequest = 0;
                this.draggedFrameIndex = null;
                this.frameScrub = null;
                this.selectedFrameIndices = [];
                this.frameSelectionAnchor = null;
                this.timelineSelectionFocused = false;
                this.frameClipboard = null;

                this.isSelectingBox = false;
                this.selectionStart = { x: 0, y: 0 };
                this.selectionCurr = { x: 0, y: 0 };

                this.isPlaying = false;
                this.loopMode = 'loop';
                this.playTimer = null;
                this.fps = 12;
                this.isOnion = false;
                this.onionFrames = 1;
                this.onionAfter = 0;
                this.onionTint = true;
                this.onionOpacity = 0.3;

                this.canvasWidth = 600;
                this.canvasHeight = 600;
                this.projectName = 'Untitled';
                this.fileSaved = true;
                this.zoom = 1.0;
                this.panelsHidden = false;
                this.guideStep = 0;
                this.isHandTool = false;
                this.spacePanActive = false;
                this.spacePanUsed = false;
                this.panStart = null;

                this.textInputPos = { x: 0, y: 0 };
                this.editingTextObject = null;

                this.palette = ['#000000', '#ffffff', '#FF3B30', '#FF9500', '#FFCC00', '#4CD964', '#5AC8FA', '#007AFF', '#5856D6', '#8E8E93'];
                this.paletteEditIndex = -1;

                this.history = [];
                this.redoStack = [];

                this.db = new IDBHelper('SketchMotionDB', 'projects');

                this.init();
            }

            async init() {
                this.loadTheme();
                this.syncWhatsNew();
                this.setupEvents();
                this.setupEditableNumbers();
                this.handleResize();
                window.addEventListener('resize', () => this.handleResize());
                // Icon fonts can finish loading after the first layout and change
                // the toolbar's height.
                document.fonts?.ready.then(() => this.fitToolsPanel());
                window.addEventListener('load', () => this.fitToolsPanel());
                this.resizeCanvas(this.canvasWidth, this.canvasHeight);

                const hadProject = await this.loadStorage();
                this.renderUI();
                this.renderPalette();
                this.updateCursorStyle();
                this.updateBrushPreview();
                this.updateInspector();
                this.syncOnionUI();
                this.watchPanelEdges();
                this.registerServiceWorker();

                const picker = document.getElementById('html-color-picker');
                if (picker) picker.value = this.brushColor;
                if (!hadProject && !this.readPref(GUIDE_KEY)) this.showWelcome(true);
            }

            // Marks the settings panel when it can scroll further, so its edges
            // can fade instead of cutting a row in half.
            watchPanelEdges() {
                const panel = document.querySelector('.props-panel');
                if (!panel) return;
                const update = () => {
                    const more = panel.scrollHeight - panel.clientHeight;
                    panel.classList.toggle('more-above', more > 1 && panel.scrollTop > 1);
                    panel.classList.toggle('more-below', more > 1 && panel.scrollTop < more - 1);
                };
                panel.addEventListener('scroll', update, { passive: true });
                if (window.ResizeObserver) {
                    const observer = new ResizeObserver(update);
                    observer.observe(panel);
                    [...panel.children].forEach(child => observer.observe(child));
                }
                update();
            }

            loadTheme() {
                let theme = 'dark';
                try { theme = localStorage.getItem('motionSketchTheme') || 'dark'; } catch (e) { /* storage blocked */ }
                document.body.setAttribute('data-theme', theme);
                this.updateThemeIcon(theme);
            }

            registerServiceWorker() {
                if (!('serviceWorker' in navigator) || location.protocol !== 'https:' && location.hostname !== 'localhost') return;
                navigator.serviceWorker.register(new URL('./sw.js', location.href)).catch((error) => {
                    console.info('Offline support was not installed.', error);
                });
            }

            toggleTheme() {
                const current = document.body.getAttribute('data-theme');
                const next = current === 'light' ? 'dark' : 'light';
                document.body.setAttribute('data-theme', next);
                try { localStorage.setItem('motionSketchTheme', next); } catch (e) { /* storage blocked */ }
                this.updateThemeIcon(next);
            }

            updateThemeIcon(theme) {
                const icon = document.getElementById('theme-icon');
                if (!icon) return;
                icon.className = theme === 'light' ? 'fas fa-sun' : 'fas fa-moon';
            }

            adjustZoom(delta, pointer = null) {
                const workspace = document.querySelector('.workspace');
                const before = this.canvasWrapper.getBoundingClientRect();
                const focusX = pointer?.clientX ?? before.left + before.width / 2;
                const focusY = pointer?.clientY ?? before.top + before.height / 2;
                const focusRatioX = before.width ? (focusX - before.left) / before.width : 0.5;
                const focusRatioY = before.height ? (focusY - before.top) / before.height : 0.5;
                this.zoom = Math.max(0.1, Math.min(5.0, Math.round((this.zoom + delta) * 10) / 10));
                this.applyZoom();
                if (workspace) {
                    const after = this.canvasWrapper.getBoundingClientRect();
                    workspace.scrollLeft += (after.width - before.width) * focusRatioX;
                    workspace.scrollTop += (after.height - before.height) * focusRatioY;
                }
            }

            // Hide panels (Tab): the settings panel and frame strip tuck away so the
            // canvas gets the room. Tools, Play and the frame buttons stay.
            setPanelsHidden(hidden) {
                this.panelsHidden = hidden;
                document.body.classList.toggle('panels-hidden', hidden);
                const toggle = document.getElementById('panels-toggle');
                if (toggle) {
                    toggle.setAttribute('aria-pressed', String(hidden));
                    toggle.setAttribute('aria-label', hidden ? 'Show panels' : 'Hide panels');
                    toggle.title = hidden ? 'Show panels (Tab)' : 'Hide panels (Tab)';
                    toggle.innerHTML = `<i class="fas fa-${hidden ? 'compress' : 'expand'}"></i>`;
                }
                this.handleResize();
            }

            togglePanels() {
                this.setPanelsHidden(!this.panelsHidden);
            }

            canHidePanels() {
                return Boolean(document.getElementById('panels-toggle')?.offsetParent);
            }

            resetZoom() {
                this.fitCanvas();
            }

            fitCanvas() {
                this.zoom = 1.0;
                this.applyZoom();
            }

            startPan(e, workspace) {
                e.preventDefault();
                e.stopPropagation();
                this.spacePanUsed = this.spacePanUsed || this.spacePanActive;
                this.panStart = { x: e.clientX, y: e.clientY, left: workspace.scrollLeft, top: workspace.scrollTop };
                workspace.classList.add('is-panning');
                workspace.setPointerCapture?.(e.pointerId);
            }

            applyZoom() {
                document.getElementById('zoom-disp').innerText = Math.round(this.zoom * 100) + '%';
                this.handleResize();
                this.updateCursorStyle();
            }

            // The tool column's height depends on the window and on whether the
            // motion timeline is open, so fixed breakpoints missed sizes such as
            // 1280x720 and tablet widths, letting the last tools spill onto the
            // timeline. Step down to smaller buttons until the last tool fits.
            fitToolsPanel() {
                const panel = document.querySelector('.tools-panel');
                const last = document.getElementById('tool-hand');
                const timeline = document.querySelector('.timeline-panel');
                if (!panel || !last) return;
                // The panel's stylesheet bottom can reach behind the timeline at some
                // heights; end it just above the timeline instead.
                panel.style.removeProperty('bottom');
                const timelineTop = timeline?.getBoundingClientRect().top;
                if (timelineTop && panel.getBoundingClientRect().bottom > timelineTop - 8) {
                    panel.style.bottom = `${Math.round(window.innerHeight - timelineTop + 8)}px`;
                }
                const fits = () => last.getBoundingClientRect().bottom <= panel.getBoundingClientRect().bottom - 2;
                // Tool buttons animate size changes; measure final sizes, not frames
                // of the animation.
                panel.classList.add('tools-measuring');
                const steps = ['tools-compact', 'tools-tight', 'tools-tiny'];
                panel.classList.remove(...steps);
                for (const step of steps) {
                    if (fits()) break;
                    panel.classList.remove(...steps);
                    panel.classList.add(step);
                }
                void panel.offsetHeight;
                panel.classList.remove('tools-measuring');
            }

            // How far the motion timeline, when open, reaches into the canvas area.
            // Zoom floats at the bottom-right of the visible canvas area, above
            // the timeline whichever height it currently has.
            positionZoomControls() {
                const zoom = document.querySelector('.zoom-controls');
                const workspace = document.querySelector('.workspace');
                const timeline = document.querySelector('.timeline-panel');
                if (!zoom || !workspace) return;
                const area = workspace.getBoundingClientRect();
                const bottom = Math.min(area.top + workspace.clientHeight, timeline ? timeline.getBoundingClientRect().top : Infinity) - 12;
                zoom.style.left = `${Math.round(area.left + workspace.clientWidth - zoom.offsetWidth - 12)}px`;
                zoom.style.top = `${Math.round(bottom - zoom.offsetHeight)}px`;
            }

            handleResize() {
                this.fitToolsPanel();
                const workspace = document.querySelector('.workspace');
                if (!workspace) return;

                const availW = workspace.clientWidth - 48;
                const availH = workspace.clientHeight - 48;
                const aspect = this.canvasWidth / this.canvasHeight;
                let w, h;

                if (availW / availH > aspect) {
                    h = availH; w = h * aspect;
                } else {
                    w = availW; h = w / aspect;
                }

                w *= this.zoom;
                h *= this.zoom;

                this.canvasWrapper.style.width = `${w}px`;
                this.canvasWrapper.style.height = `${h}px`;
                this.positionZoomControls();
                if (this.showGrid) this.canvasWrapper.style.setProperty('--grid-size', `${this.snapSize * this.zoom}px`);
                this.updateBrushPreview();
                this.renderGuide();
            }

            setupEvents() {
                const c = this.canvas;
                const workspace = document.querySelector('.workspace');
                c.tabIndex = 0;

                ['brush-wrapper', 'shape-wrapper'].forEach((wrapperId) => {
                    const wrapper = document.getElementById(wrapperId);
                    const menu = wrapper?.querySelector('.flyout-menu');
                    wrapper?.addEventListener('mouseenter', () => {
                        if (document.body.classList.contains('truck-active')) {
                            this.portalTruckFlyout(wrapperId);
                            this.positionTruckFlyout(wrapperId);
                        }
                    });
                    wrapper?.addEventListener('mousemove', () => this.positionTruckFlyout(wrapperId));
                    wrapper?.addEventListener('mouseleave', () => {
                        if (!wrapper.classList.contains('expanded')) {
                            setTimeout(() => {
                                if (!wrapper.matches(':hover') && !menu?.matches(':hover')) this.setFlyoutExpanded(wrapperId, wrapperId === 'brush-wrapper' ? 'tool-brush-anchor' : 'tool-shape-anchor', false);
                            }, 150);
                        }
                    });
                    menu?.addEventListener('mouseleave', () => {
                        if (!wrapper.classList.contains('expanded')) {
                            setTimeout(() => {
                                if (!wrapper.matches(':hover') && !menu.matches(':hover')) this.setFlyoutExpanded(wrapperId, wrapperId === 'brush-wrapper' ? 'tool-brush-anchor' : 'tool-shape-anchor', false);
                            }, 150);
                        }
                    });
                });
                document.querySelector('.tools-panel')?.addEventListener('scroll', () => {
                    ['brush-wrapper', 'shape-wrapper'].forEach((wrapperId) => this.positionTruckFlyout(wrapperId));
                });

                workspace?.addEventListener('wheel', (e) => {
                    if (!e.ctrlKey && !e.metaKey) return;
                    e.preventDefault();
                    this.adjustZoom(e.deltaY < 0 ? 0.1 : -0.1, e);
                }, { passive: false });

                workspace?.addEventListener('pointerdown', (e) => {
                    if (e.button !== 1 && !this.isHandTool && !this.spacePanActive) return;
                    this.clearFrameSelection();
                    this.startPan(e, workspace);
                }, true);

                const start = (e) => this.onDown(this.getPos(e), e.pressure, e.ctrlKey || e.metaKey);
                const move = (e) => {
                    // The browser sends one move per screen refresh and keeps the
                    // positions in between; a brush stroke uses them all, so fast
                    // curves don't turn into straight pieces.
                    const events = this.isDrawing && this.tool === 'brush' && e.getCoalescedEvents ? e.getCoalescedEvents() : [];
                    (events.length ? events : [e]).forEach((ev) => {
                        let p = ev.pressure;
                        if (ev.pointerType === 'mouse' && e.buttons === 1) p = 0.5;
                        this.onMove(this.getPos(ev), p);
                    });
                };
                const end = (e) => this.onUp();

                window.addEventListener('pointermove', (e) => {
                    if (this.panStart && workspace) {
                        workspace.scrollLeft = this.panStart.left - (e.clientX - this.panStart.x);
                        workspace.scrollTop = this.panStart.top - (e.clientY - this.panStart.y);
                        this.spacePanUsed = this.spacePanUsed || this.spacePanActive;
                        return;
                    }
                    this.updateCursorPos(e);
                    if (this.isDrawing || this.selectedObject || this.isSelectingBox || this.pathKeyDrag || (this.tool === 'truck' && this.truckSelectedTrackId)) move(e);
                });

                c.addEventListener('pointerenter', () => { if (this.isDrawingTool()) this.cursorEl.style.display = 'block'; });
                c.addEventListener('pointerleave', () => { this.cursorEl.style.display = 'none'; });

                c.addEventListener('pointerdown', (e) => {
                    this.clearFrameSelection();
                    if (this.isHandTool || this.spacePanActive || e.button === 1) {
                        this.startPan(e, workspace);
                        return;
                    }
                    c.focus({ preventScroll: true });
                    c.setPointerCapture(e.pointerId);
                    start(e);
                });
                // Select can begin a marquee in the empty workspace around the canvas,
                // so a box can be dragged over everything. Touch keeps scrolling.
                workspace?.addEventListener('pointerdown', (e) => {
                    if (e.target !== workspace || this.tool !== 'select' || e.button !== 0 || e.pointerType === 'touch') return;
                    if (e.offsetX >= workspace.clientWidth || e.offsetY >= workspace.clientHeight) return;
                    e.preventDefault();
                    this.clearFrameSelection();
                    c.focus({ preventScroll: true });
                    workspace.setPointerCapture?.(e.pointerId);
                    start(e);
                });
                c.addEventListener('dblclick', (e) => {
                    if (this.tool !== 'select') return;
                    const found = this.hitTest(this.getPos(e));
                    if (found && found.stroke.type === 'text') {
                        e.preventDefault();
                        this.selectedObject = found;
                        this.calcBounds(found.stroke);
                        this.openTextModal({ x: found.stroke.x, y: found.stroke.y }, found.stroke);
                        this.renderCanvas();
                    }
                });
                window.addEventListener('pointerup', (e) => {
                    if (this.panStart && workspace) {
                        workspace.classList.remove('is-panning');
                        workspace.releasePointerCapture?.(e.pointerId);
                        this.panStart = null;
                        return;
                    }
                    c.releasePointerCapture(e.pointerId);
                    end(e);
                });

                c.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
                c.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

                document.addEventListener('click', (e) => {
                    if (!e.target.closest?.('#frames-list') && !e.target.closest?.('#canvas-wrapper')) {
                        this.timelineSelectionFocused = false;
                    }
                    const shapeWrapper = document.getElementById('shape-wrapper');
                    if (shapeWrapper && !shapeWrapper.contains(e.target)) this.setFlyoutExpanded('shape-wrapper', 'tool-shape-anchor', false);
                    const brushWrapper = document.getElementById('brush-wrapper');
                    if (brushWrapper && !brushWrapper.contains(e.target)) this.setFlyoutExpanded('brush-wrapper', 'tool-brush-anchor', false);
                    const exportWrapper = document.getElementById('export-menu-wrapper');
                    if (exportWrapper && !exportWrapper.contains(e.target)) this.setExportMenuOpen(false);
                    const fileWrapper = document.getElementById('file-menu-wrapper');
                    if (fileWrapper && !fileWrapper.contains(e.target)) this.setFileMenuOpen(false);
                    const drawingAids = document.querySelector('.drawing-aids-wrapper');
                    if (drawingAids && !drawingAids.contains(e.target)) this.setDrawingAidsOpen(false);
                });

                document.addEventListener('keydown', (e) => {
                    if (e.key === 'Escape') {
                        if (!document.getElementById('drawing-aids-menu')?.hidden) {
                            e.preventDefault();
                            this.setDrawingAidsOpen(false, true);
                            return;
                        }
                        if (!document.getElementById('export-menu')?.hidden) {
                            e.preventDefault();
                            this.setExportMenuOpen(false, true);
                            return;
                        }
                        if (!document.getElementById('file-menu')?.hidden) {
                            e.preventDefault();
                            this.setFileMenuOpen(false, true);
                            return;
                        }
                        const openModal = [...document.querySelectorAll('.modal-overlay')].find((modal) => modal.style.display === 'flex');
                        if (openModal) {
                            e.preventDefault();
                            this.closeModal(openModal.id);
                            return;
                        }
                        if (this.panelsHidden) {
                            e.preventDefault();
                            this.setPanelsHidden(false);
                            return;
                        }
                    }
                    const target = e.target;
                    const isTypingTarget = target && (
                        target.isContentEditable ||
                        target.tagName === 'TEXTAREA' ||
                        (target.tagName === 'INPUT' && ['text', 'number', 'password', 'search', 'email', 'url', 'tel'].includes((target.type || '').toLowerCase()))
                    );
                    if (isTypingTarget) return;
                    if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
                        e.preventDefault();
                        this.toggleShortcuts();
                        return;
                    }
                    if (target?.tagName === 'INPUT' && target.type === 'range' && e.key.startsWith('Arrow')) return;

                    const key = (e.key || '').toLowerCase();
                    const hasCommandModifier = e.ctrlKey || e.metaKey;
                    const hasToolModifier = hasCommandModifier || e.altKey;

                    // Copy follows the focused surface; paste follows the last successful
                    // copy, so choosing a destination frame does not switch clipboards.
                    // Explicit frame toolbar actions still use the frame clipboard.
                    if (hasCommandModifier) {
                        if (key === 'v') {
                            const frames = this.lastCopiedContent === 'frames' ||
                                (!this.lastCopiedContent && this.isTimelineCommandContext(target));
                            const pasted = frames ? this.pasteSelectedFrames() : this.pasteSelection();
                            if (pasted) e.preventDefault();
                            return;
                        }
                        if (key === 'c' && this.isTimelineCommandContext(target)) {
                            this.copySelectedFrames();
                            e.preventDefault();
                            return;
                        }
                        if (key === 'c' && this.copySelection()) {
                            e.preventDefault();
                            return;
                        }
                        if (key === 'z' && !e.shiftKey && this.undo()) {
                            e.preventDefault();
                            return;
                        }
                        if ((key === 'y' || (key === 'z' && e.shiftKey)) && this.redo()) {
                            e.preventDefault();
                            return;
                        }
                        if (key === 'a') {
                            e.preventDefault();
                            this.selectAll();
                            return;
                        }
                        if (key === 'g') {
                            e.preventDefault();
                            if (e.shiftKey) this.ungroupSelection();
                            else this.groupSelection();
                        }
                        return;
                    }

                    // Alt-modified keys belong to the browser/operating system rather
                    // than the canvas. Do not turn them into drawing or frame commands.
                    if (hasToolModifier) return;

                    // Tab hides the panels while drawing. On a button or slider it
                    // still moves focus, so the keyboard can reach every control.
                    if (e.key === 'Tab' && !e.shiftKey && this.canHidePanels() &&
                        (target === document.body || target === document.documentElement || target?.closest?.('.workspace'))) {
                        e.preventDefault();
                        this.togglePanels();
                        return;
                    }

                    if (e.code === 'Space') {
                        e.preventDefault();
                        this.spacePanActive = true;
                        workspace?.classList.add('space-pan-active');
                        return;
                    }

                    if (e.key === 'Delete' || e.key === 'Backspace') {
                        // Some browsers go back a page on Backspace; never let that happen here.
                        e.preventDefault();
                        if (this.selectedObject) {
                            this.deleteSelected();
                        } else if (this.frames.length > 1 && this.isTimelineCommandContext(target)) {
                            this.deleteFrame();
                        }
                    }

                    if (key === 'd') this.duplicateFrame();
                    // A for Add (easier to remember); N kept for anyone already using it.
                    if (key === 'a' || key === 'n') this.addFrame();
                    if (key === '0') { e.preventDefault(); this.fitCanvas(); }
                    if (key === '+' || key === '=') { e.preventDefault(); this.adjustZoom(0.1); }
                    if (key === '-') { e.preventDefault(); this.adjustZoom(-0.1); }

                    if (key === 'b') this.setTool('brush');
                    if (key === 'e') this.setTool('eraser');
                    if (key === 'v') this.setTool('select');
                    if (key === 'f') this.setTool('bucket');
                    if (key === 'h') this.toggleHandTool();
                    if (key === 't') this.setTool('text');
                    if (key === 'r') this.setTool('rect');
                    if (key === 'c') this.setTool('circle');
                    if (key === 'l') this.setTool('line');

                    if (e.key === 'ArrowLeft') {
                        this.previousFrame();
                    }
                    if (e.key === 'ArrowRight') {
                        this.nextFrame();
                    }
                });

                document.addEventListener('keyup', (e) => {
                    if (e.code !== 'Space' || !this.spacePanActive) return;
                    e.preventDefault();
                    this.spacePanActive = false;
                    workspace?.classList.remove('space-pan-active');
                    if (!this.spacePanUsed) this.togglePlay();
                    this.spacePanUsed = false;
                });
                window.addEventListener('blur', () => {
                    this.spacePanActive = false;
                    this.spacePanUsed = false;
                    this.panStart = null;
                    workspace?.classList.remove('space-pan-active', 'is-panning');
                });
            }

            setupEditableNumbers() {
                const makeEditable = (displayId, sliderId, setterMethod, min, max) => {
                    const display = document.getElementById(displayId);
                    const slider = document.getElementById(sliderId);
                    if (!display || !slider) return;

                    display.style.cursor = 'pointer';
                    display.title = 'Double-click to edit';

                    display.addEventListener('dblclick', () => {
                        display.contentEditable = 'true';
                        display.focus();
                        const range = document.createRange();
                        range.selectNodeContents(display);
                        const sel = window.getSelection();
                        sel.removeAllRanges();
                        sel.addRange(range);
                    });

                    display.addEventListener('blur', () => {
                        display.contentEditable = 'false';
                        let value = parseInt(display.innerText);
                        if (isNaN(value)) value = parseInt(slider.value);
                        value = Math.max(min, Math.min(max, value));
                        slider.value = value;
                        setterMethod.call(this, value);
                    });

                    display.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter') { e.preventDefault(); display.blur(); }
                        else if (e.key === 'Escape') { display.innerText = slider.value; display.blur(); }
                    });
                };

                makeEditable('size-disp', 'brush-size', this.setSize, 1, 200);
                makeEditable('op-disp', 'brush-opacity', this.setOpacity, 1, 100);
            }

            isDrawingTool() {
                return ['brush', 'pencil', 'marker', 'highlighter', 'eraser'].includes(this.tool);
            }

            updateCursorPos(e) {
                if (this.isDrawingTool()) {
                    this.cursorEl.style.left = e.clientX + 'px';
                    this.cursorEl.style.top = e.clientY + 'px';
                }
            }

            updateCursorStyle() {
                this.updateBrushPreview();

                if (!this.isDrawingTool()) {
                    this.cursorEl.style.display = 'none';
                    return;
                }

                const preview = this.getBrushScreenPreview();

                this.cursorEl.style.width = preview.cursorWidth + 'px';
                this.cursorEl.style.height = preview.cursorHeight + 'px';

                if (this.tool === 'eraser') {
                    this.cursorEl.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
                    this.cursorEl.style.borderColor = '#000';
                } else {
                    this.cursorEl.style.backgroundColor = this.hexToRgba(this.brushColor, this.opacity);
                    this.cursorEl.style.borderColor = this.hexToRgba(this.brushColor, Math.min(1, this.opacity + 0.3));
                }
            }

            getBrushScreenPreview() {
                const rect = this.canvas.getBoundingClientRect();
                const displayScale = rect.width / this.canvasWidth;
                const type = this.tool === 'eraser' ? 'eraser' : this.brushType;
                const baseSize = type === 'pencil' ? 2 : type === 'highlighter' ? this.brushSize * 2 : this.brushSize;
                const screenSize = Math.max(1, baseSize * displayScale);

                if (type === 'highlighter') {
                    return {
                        type,
                        cursorWidth: screenSize,
                        cursorHeight: screenSize,
                        previewWidth: Math.min(screenSize * 1.6, 200),
                        previewHeight: screenSize
                    };
                }

                if (type === 'pencil') {
                    return {
                        type,
                        cursorWidth: Math.max(2, screenSize),
                        cursorHeight: Math.max(2, screenSize),
                        previewWidth: 48,
                        previewHeight: Math.max(2, screenSize)
                    };
                }

                return {
                    type,
                    cursorWidth: screenSize,
                    cursorHeight: screenSize,
                    previewWidth: screenSize,
                    previewHeight: screenSize
                };
            }

            updateBrushPreview() {
                const mark = document.getElementById('brush-preview-mark');
                if (!mark) return;

                const brushPreview = this.getBrushScreenPreview();
                const type = brushPreview.type;
                const alpha = type === 'highlighter' ? Math.min(1, this.opacity * 0.4) : this.opacity;
                const color = type === 'eraser' ? 'rgba(255, 255, 255, 0.55)' : this.hexToRgba(this.brushColor, alpha);

                // The inspector is a scaled sample, so map the full 1–200
                // brush-size range into a fitting SVG stroke width instead of
                // using the viewport-scaled cursor size (which plateaus early).
                const brushSize = Math.max(1, Math.min(200, Number(this.brushSize) || 1));
                const previewStrokeWidth = 2 + ((brushSize - 1) / 199) * 32;

                // Keep the compact wave preview responsive to the same brush
                // type, color, opacity, and selected size as the canvas cursor.
                mark.style.stroke = color;
                mark.style.strokeWidth = previewStrokeWidth.toFixed(2);
                mark.style.opacity = '1';
                const lightStroke = type === 'eraser' || String(this.brushColor).toLowerCase() === '#ffffff';
                mark.style.filter = lightStroke
                    ? 'drop-shadow(0 0 1px rgba(0, 0, 0, 0.55))'
                    : type === 'pencil'
                    ? `drop-shadow(0 0 0 ${this.hexToRgba(this.brushColor, Math.max(0.45, alpha))})`
                    : 'none';
            }

            getPos(e) {
                const rect = this.canvas.getBoundingClientRect();
                const scaleX = this.canvasWidth / rect.width;
                const scaleY = this.canvasHeight / rect.height;
                return {
                    x: (e.clientX - rect.left) * scaleX,
                    y: (e.clientY - rect.top) * scaleY
                };
            }

            resizeCanvas(w, h) {
                const { width, height } = this.normalizeCanvasSize(w, h);
                this.canvasWidth = width;
                this.canvasHeight = height;
                this.bgCanvas.width = width;
                this.bgCanvas.height = height;
                this.canvas.width = width;
                this.canvas.height = height;
                this.canvasWrapper.style.aspectRatio = `${width}/${height}`;
                this.canvasWrapper.style.width = 'auto';
                this.canvasWrapper.style.height = 'auto';
                this.handleResize();
                this.renderCanvas();
            }

            normalizeCanvasSize(width, height) {
                const min = 64;
                const max = 2048;
                const maxPixels = 4_000_000;
                let safeWidth = Math.min(max, Math.max(min, Math.round(Number(width) || 600)));
                let safeHeight = Math.min(max, Math.max(min, Math.round(Number(height) || 600)));
                const scale = Math.min(1, Math.sqrt(maxPixels / (safeWidth * safeHeight)));
                safeWidth = Math.max(min, Math.round(safeWidth * scale));
                safeHeight = Math.max(min, Math.round(safeHeight * scale));
                return { width: safeWidth, height: safeHeight };
            }

            openSettings() {
                this.backgroundImageRequest++;
                this.backgroundImageDraft = this.backgroundImage;
                this.backgroundImageLoading = false;
                this.syncBackgroundImageSettings();
                document.getElementById('canvas-width').value = this.canvasWidth;
                document.getElementById('canvas-height').value = this.canvasHeight;
                this.syncCanvasPresets();
                const name = document.getElementById('project-name-input');
                if (name) name.value = this.projectName;
                const speed = document.getElementById('project-fps');
                if (speed) speed.value = String(this.fps);
                this.syncProjectSpeed(this.fps);
                this.openModal('settings-modal', 'project-name-input');
            }

            pickCanvasPreset(button) {
                const width = document.getElementById('canvas-width');
                const height = document.getElementById('canvas-height');
                if (button.dataset.custom) {
                    width.focus();
                    width.select();
                } else {
                    width.value = button.dataset.width;
                    height.value = button.dataset.height;
                }
                this.syncCanvasPresets(Boolean(button.dataset.custom));
            }

            // The preset matching the size is shown as picked; any other size is Custom.
            syncCanvasPresets(custom = false) {
                const width = Number(document.getElementById('canvas-width')?.value);
                const height = Number(document.getElementById('canvas-height')?.value);
                const presets = [...document.querySelectorAll('.size-preset')];
                const match = custom ? null : presets.find((preset) => Number(preset.dataset.width) === width && Number(preset.dataset.height) === height);
                presets.forEach((preset) => preset.setAttribute('aria-pressed', String(match ? preset === match : Boolean(preset.dataset.custom))));
            }

            syncProjectSpeed(value) {
                const label = document.getElementById('project-fps-label');
                if (label) label.textContent = `${value} frames per second`;
            }

            openModal(id, focusId) {
                this.modalReturnFocus = document.activeElement;
                const modal = document.getElementById(id);
                modal.style.display = 'flex';
                modal.setAttribute('aria-hidden', 'false');
                document.getElementById(focusId)?.focus();
                this.renderGuide();
            }

            applySettings() {
                if (this.backgroundImageLoading) return;
                const { width, height } = this.normalizeCanvasSize(
                    document.getElementById('canvas-width').value,
                    document.getElementById('canvas-height').value
                );
                document.getElementById('canvas-width').value = width;
                document.getElementById('canvas-height').value = height;
                if (width !== this.canvasWidth || height !== this.canvasHeight || this.backgroundImageDraft !== this.backgroundImage) {
                    this.saveState();
                    this.backgroundImage = this.backgroundImageDraft;
                    this.resizeCanvas(width, height);
                    this.renderUI();
                    this.updateThumbnails();
                    this.renderCanvas();
                }
                // Name and speed only come from the dialog while it is open.
                if (document.getElementById('settings-modal')?.getAttribute('aria-hidden') === 'false') {
                    const name = document.getElementById('project-name-input')?.value.trim();
                    if (name && name !== this.projectName) this.setProjectName(name);
                    const speed = Number(document.getElementById('project-fps')?.value);
                    if (speed && speed !== this.fps) this.setFps(speed);
                }
                this.closeModal('settings-modal');
                this.saveStorage();
            }

            syncBackgroundImageSettings(error = '') {
                const image = this.backgroundImageDraft;
                document.getElementById('background-image-set').hidden = Boolean(image);
                document.getElementById('background-image-file').hidden = !image;
                document.getElementById('background-image-name').textContent = image?.name || '';
                document.getElementById('background-image-hint').textContent = this.backgroundImageLoading
                    ? 'Loading image…' : image ? 'All frames · Fits without stretching.' : 'Behind your drawings on every frame.';
                const errorNode = document.getElementById('background-image-error');
                errorNode.hidden = !error;
                errorNode.textContent = error;
                document.getElementById('settings-apply').disabled = Boolean(this.backgroundImageLoading);
            }

            async decodeBackgroundImage(value) {
                if (value == null) return null;
                if (typeof value !== 'object' || typeof value.dataUrl !== 'string' ||
                    value.dataUrl.length > Math.ceil(BACKGROUND_IMAGE_MAX_BYTES / 3) * 4 + 64 ||
                    !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value.dataUrl)) {
                    throw new Error('Use a PNG, JPEG or WebP background image up to 10 MB.');
                }
                let image = this.backgroundImageCache.get(value.dataUrl);
                if (!image) {
                    image = new Image();
                    image.src = value.dataUrl;
                    try { await image.decode(); } catch { throw new Error('This background image could not be opened.'); }
                    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > BACKGROUND_IMAGE_MAX_PIXELS) {
                        throw new Error('Background images must be 16 megapixels or smaller.');
                    }
                    this.backgroundImageCache.set(value.dataUrl, image);
                }
                return { name: String(value.name || 'Background image').slice(0, 160), dataUrl: value.dataUrl, width: image.naturalWidth, height: image.naturalHeight };
            }

            async loadBackgroundImage(input) {
                const file = input.files?.[0];
                input.value = '';
                if (!file) return;
                const request = ++this.backgroundImageRequest;
                this.backgroundImageLoading = true;
                this.syncBackgroundImageSettings();
                try {
                    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > BACKGROUND_IMAGE_MAX_BYTES) {
                        throw new Error('Use a PNG, JPEG or WebP background image up to 10 MB.');
                    }
                    const dataUrl = await new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve(reader.result);
                        reader.onerror = () => reject(new Error('Could not read the background image.'));
                        reader.readAsDataURL(file);
                    });
                    const image = await this.decodeBackgroundImage({ name: file.name, dataUrl });
                    if (request !== this.backgroundImageRequest) return;
                    this.backgroundImageDraft = image;
                    this.backgroundImageLoading = false;
                    this.syncBackgroundImageSettings();
                } catch (error) {
                    if (request !== this.backgroundImageRequest) return;
                    this.backgroundImageLoading = false;
                    this.syncBackgroundImageSettings(error.message);
                }
            }

            removeBackgroundImage() {
                this.backgroundImageRequest++;
                this.backgroundImageLoading = false;
                this.backgroundImageDraft = null;
                this.syncBackgroundImageSettings();
            }

            getBackgroundImagePlacement() {
                const image = this.backgroundImage;
                if (!image) return null;
                const scale = Math.min(this.canvasWidth / image.width, this.canvasHeight / image.height);
                const width = image.width * scale, height = image.height * scale;
                return { x: (this.canvasWidth - width) / 2, y: (this.canvasHeight - height) / 2, width, height };
            }

            drawBackgroundImage(context) {
                const image = this.backgroundImageCache.get(this.backgroundImage?.dataUrl);
                const placement = this.getBackgroundImagePlacement();
                if (!image || !placement) return;
                context.save();
                context.globalAlpha = 1;
                context.drawImage(image, placement.x, placement.y, placement.width, placement.height);
                context.restore();
            }

            openTextModal(pos, textObject = null) {
                this.textInputPos = pos;
                this.editingTextObject = textObject;
                document.getElementById('text-modal-title').innerText = textObject ? 'Edit Text' : 'Enter Text';
                document.getElementById('text-modal-submit').innerText = textObject ? 'Update' : 'Add';
                const input = document.getElementById('text-input-value');
                input.value = textObject ? textObject.text : "";
                document.getElementById('text-size').value = textObject ? textObject.size : this.brushSize * 2 + 20;
                document.getElementById('text-bold').checked = Boolean(textObject?.bold);
                this.openModal('text-modal', 'text-input-value');
                input.select();
            }

            confirmAddText() {
                const val = document.getElementById('text-input-value').value;
                const textSize = Math.max(12, Math.min(200, Number(document.getElementById('text-size').value) || 40));
                const textBold = document.getElementById('text-bold').checked;
                if (val) {
                    this.saveState();
                    if (this.editingTextObject) {
                        const textObj = this.editingTextObject;
                        textObj.size = textSize; textObj.bold = textBold; this.ctx.font = `${textBold ? 'bold ' : ''}${textSize}px sans-serif`;
                        const m = this.ctx.measureText(val);
                        textObj.text = val;
                        textObj.width = m.width;
                        textObj.height = textSize;
                        if (this.selectedObject && this.selectedObject.stroke === textObj) this.calcBounds(textObj);
                        this.commitMotionArtworkEdits();
                    } else {
                        this.ctx.font = `${textBold ? 'bold ' : ''}${textSize}px sans-serif`;
                        const m = this.ctx.measureText(val);
                        const h = textSize;

                        const textObj = {
                            type: 'text',
                            text: val,
                            x: this.textInputPos.x,
                            y: this.textInputPos.y,
                            width: m.width,
                            height: h,
                            sx: 1, sy: 1,
                            color: this.brushColor,
                            size: h,
                            bold: textBold,
                            opacity: this.opacity,
                            angle: 0,
                            points: []
                        };
                        const list = this.getActiveStrokeList();
                        list.push(textObj);
                    }
                    this.renderCanvas();
                    this.queueEditedThumbnails();
                    this.saveStorage();
                }
                this.closeModal('text-modal');
                this.editingTextObject = null;
                this.setTool('select');
            }

            renderPalette() {
                const container = document.getElementById('palette-container');
                container.innerHTML = '';
                this.palette.forEach((color, index) => {
                    const div = document.createElement('div');
                    div.className = 'swatch';
                    div.style.backgroundColor = color;
                    div.title = "Double-click to edit";
                    if (this.brushColor === color) div.classList.add('active');
                    div.onclick = () => this.setColor(color);
                    div.ondblclick = (e) => { e.stopPropagation(); this.openPaletteEditor(index, div); }
                    container.appendChild(div);
                });
            }

            openPaletteEditor(index, element) {
                this.paletteEditIndex = index;
                const input = document.getElementById('palette-editor-input');
                if (element) {
                    const rect = element.getBoundingClientRect();
                    input.style.left = rect.left + 'px';
                    input.style.top = rect.top + 'px';
                    input.style.width = rect.width + 'px';
                    input.style.height = rect.height + 'px';
                    input.style.zIndex = 100;
                }
                input.value = this.palette[index];
                setTimeout(() => {
                    input.click();
                    setTimeout(() => input.style.zIndex = -1, 100);
                }, 10);
            }

            confirmPaletteEdit(newColor) {
                if (this.paletteEditIndex > -1) {
                    this.palette[this.paletteEditIndex] = newColor;
                    this.renderPalette();
                    this.setColor(newColor);
                    this.saveStorage();
                }
            }

            cloneData(value) {
                return JSON.parse(JSON.stringify(value));
            }

            getSelectedFrameIndices() {
                const selected = Array.isArray(this.selectedFrameIndices) ? this.selectedFrameIndices : [];
                return [...new Set(selected)]
                    .filter((index) => Number.isInteger(index) && index >= 0 && index < this.frames.length)
                    .sort((a, b) => a - b);
            }

            updateFrameSelectionUI() {
                const selected = new Set(this.getSelectedFrameIndices());
                this.framesList?.querySelectorAll('.frame-card').forEach((card, index) => {
                    const isSelected = selected.has(index);
                    card.classList.toggle('frame-selected', isSelected);
                });
                this.syncFrameActions();
            }

            syncFrameActions() {
                const duplicate = document.getElementById('timeline-duplicate');
                const remove = document.getElementById('timeline-delete');
                const copy = document.getElementById('timeline-copy');
                const paste = document.getElementById('timeline-paste');
                const hasFrames = this.frames.length > 0;
                if (duplicate) duplicate.disabled = !hasFrames;
                if (remove) remove.disabled = !hasFrames;
                if (copy) copy.disabled = !hasFrames;
                if (paste) paste.disabled = !Array.isArray(this.frameClipboard?.frames) || !this.frameClipboard.frames.length;
            }

            clearFrameSelection(render = true) {
                this.selectedFrameIndices = [];
                this.frameSelectionAnchor = null;
                this.timelineSelectionFocused = false;
                if (render) this.updateFrameSelectionUI();
            }

            isTimelineCommandContext(target = document.activeElement) {
                if (target === this.canvas || target?.closest?.('#canvas-wrapper')) return false;
                return Boolean(this.timelineSelectionFocused || target?.closest?.('#frames-list'));
            }

            handleFrameCardClick(index, event) {
                const isRange = Boolean(event?.shiftKey);
                const isToggle = Boolean(event?.ctrlKey || event?.metaKey);
                const current = new Set(this.getSelectedFrameIndices());

                this.timelineSelectionFocused = true;
                if (isRange) {
                    const anchor = Number.isInteger(this.frameSelectionAnchor) ? this.frameSelectionAnchor : index;
                    const start = Math.min(anchor, index);
                    const end = Math.max(anchor, index);
                    this.selectedFrameIndices = Array.from({ length: end - start + 1 }, (_, offset) => start + offset);
                } else if (isToggle) {
                    if (current.has(index)) current.delete(index);
                    else current.add(index);
                    this.selectedFrameIndices = [...current].sort((a, b) => a - b);
                    this.frameSelectionAnchor = index;
                } else {
                    this.selectedFrameIndices = [index];
                    this.frameSelectionAnchor = index;
                }

                if (!isRange && !isToggle) this.frameSelectionAnchor = index;
                if (isRange && !Number.isInteger(this.frameSelectionAnchor)) this.frameSelectionAnchor = index;
                event?.currentTarget?.focus?.({ preventScroll: true });
                this.selectFrame(index, { preserveFrameSelection: true });
                this.updateFrameSelectionUI();
            }

            copySelectedFrames() {
                const selected = this.getSelectedFrameIndices();
                const indices = selected.length ? selected : [this.frameIndex];
                if (!indices.length) return false;
                this.frameClipboard = {
                    frames: indices.map((index) => this.cloneData(this.frames[index]))
                };
                this.lastCopiedContent = 'frames';
                this.syncFrameActions();
                return true;
            }

            pasteSelectedFrames() {
                const copiedFrames = this.frameClipboard?.frames;
                if (!Array.isArray(copiedFrames) || !copiedFrames.length) return false;

                this.saveState();
                const insertAt = this.frameIndex + 1;
                const pastedFrames = this.cloneData(copiedFrames);
                this.frames.splice(insertAt, 0, ...pastedFrames);
                const pastedMotionIds = pastedFrames.map((frame) => new Set((frame.strokes || []).map((stroke) => stroke.motionTrackId).filter(Boolean)));
                this.remapMotionTracksAfterInsert(insertAt, pastedFrames.length);
                pastedFrames.forEach((frame, offset) => {
                    const frameIndex = insertAt + offset;
                    pastedMotionIds[offset].forEach((trackId) => {
                        const track = this.getMotionTrack(trackId);
                        if (track && !track.excludedFrames.includes(frameIndex)) track.excludedFrames.push(frameIndex);
                    });
                    (frame.strokes || []).forEach((stroke) => this.stripMotionMetadata(stroke));
                    // Canvas settings may have changed since copying; draw it fresh.
                    delete frame.thumb;
                });
                this.motionTracks.forEach((track) => this.applyMotionTrack(track));
                this.selectedFrameIndices = pastedFrames.map((_, offset) => insertAt + offset);
                this.frameSelectionAnchor = insertAt;
                this.timelineSelectionFocused = true;
                this.selectedObject = null;
                this.dragMode = null;
                this.renderUI();
                this.renderCanvas();
                this.saveStorage();
                return true;
            }

            // Brushes and shapes keep their line thickness in proportion when they are
            // resized (sx/sy). Shapes used to keep full thickness, so a resized group
            // mixing both changed its look: outlines stayed thick and lines that
            // students had covered with brush strokes showed through.
            scalesLineWidth(stroke) {
                return ['brush', 'rect', 'circle', 'line'].includes(stroke?.type);
            }

            getBrushScale(stroke) {
                const readScale = (axis) => {
                    const value = Number(stroke?.[axis]);
                    return Number.isFinite(value) && value !== 0 ? Math.abs(value) : 1;
                };
                return { x: readScale('sx'), y: readScale('sy') };
            }

            getPointBounds(points) {
                if (!Array.isArray(points) || points.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                points.forEach(point => {
                    if (point.x < minX) minX = point.x;
                    if (point.x > maxX) maxX = point.x;
                    if (point.y < minY) minY = point.y;
                    if (point.y > maxY) maxY = point.y;
                });
                return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
            }

            // An eraser hole is either a polygon (an array of points) or a sweep,
            // { r, path }: the eraser circle of radius r dragged along path. A drag
            // stores one sweep point per pointer move instead of a 26-point outline
            // per move, which let heavy erasing grow projects past what the browser
            // could hold in memory.
            isSweepHole(hole) {
                return Boolean(hole && !Array.isArray(hole) && Array.isArray(hole.path));
            }

            roundHolePoint(point) {
                return { x: Math.round(point.x * 100) / 100, y: Math.round(point.y * 100) / 100 };
            }

            sweepToPolygons(hole) {
                const path = hole.path;
                if (path.length === 1) return [this.buildEraserHole(path[0], path[0], hole.r)];
                return path.slice(1).map((point, index) => this.buildEraserHole(path[index], point, hole.r));
            }

            addEraserHole(stroke, from, to, radius) {
                if (!stroke.holes) stroke.holes = [];
                const r = Math.round(radius * 100) / 100;
                const start = this.roundHolePoint(from);
                const end = this.roundHolePoint(to);
                const last = stroke.holes[stroke.holes.length - 1];
                // Consecutive moves of one eraser drag continue the same sweep.
                if (this.isSweepHole(last) && last.r === r) {
                    const tail = last.path[last.path.length - 1];
                    if (tail.x === start.x && tail.y === start.y) {
                        if (end.x !== start.x || end.y !== start.y) last.path.push(end);
                        return;
                    }
                }
                stroke.holes.push({ r, path: end.x === start.x && end.y === start.y ? [start] : [start, end] });
            }

            // Older projects stored every eraser move as a 26-point capsule outline.
            // Rebuild those as sweeps (exactly the same shape) and join the moves of
            // each drag; anything that is not an untouched capsule stays a polygon.
            capsuleFromHole(hole) {
                if (!Array.isArray(hole) || hole.length !== 26 || !hole.every(point => Number.isFinite(point?.x) && Number.isFinite(point?.y))) return null;
                const from = { x: (hole[0].x + hole[12].x) / 2, y: (hole[0].y + hole[12].y) / 2 };
                const to = { x: (hole[13].x + hole[25].x) / 2, y: (hole[13].y + hole[25].y) / 2 };
                const r = Math.hypot(hole[0].x - hole[12].x, hole[0].y - hole[12].y) / 2;
                const tolerance = Math.max(0.05, r * 0.01);
                const onArcs = hole.every((point, index) => {
                    const center = index <= 12 ? from : to;
                    return Math.abs(Math.hypot(point.x - center.x, point.y - center.y) - r) <= tolerance;
                });
                return onArcs ? { from, to, r } : null;
            }

            compactEraserHoles(holes) {
                const holder = { holes: [] };
                holes.forEach(hole => {
                    const capsule = this.capsuleFromHole(hole);
                    if (capsule) this.addEraserHole(holder, capsule.from, capsule.to, capsule.r);
                    else holder.holes.push(hole);
                });
                return holder.holes;
            }

            compactStrokeHoles(stroke) {
                if (!stroke || typeof stroke !== 'object') return stroke;
                if (Array.isArray(stroke.items)) stroke.items.forEach(item => this.compactStrokeHoles(item));
                if (Array.isArray(stroke.holes) && stroke.holes.some(hole => Array.isArray(hole))) {
                    stroke.holes = this.compactEraserHoles(stroke.holes);
                }
                return stroke;
            }

            transformHoles(holes, transform, scale = null) {
                if (!Array.isArray(holes) || !holes.length) return holes;
                const uniform = !scale || Math.abs(Math.abs(scale.x) - Math.abs(scale.y)) < 1e-9;
                return holes.flatMap(hole => {
                    if (!this.isSweepHole(hole)) return [hole.map(point => transform(point))];
                    // A circle only stays a circle under uniform scaling.
                    if (!uniform) return this.sweepToPolygons(hole).map(polygon => polygon.map(point => transform(point)));
                    return [{ r: hole.r * (scale ? Math.abs(scale.x) : 1), path: hole.path.map(point => this.roundHolePoint(transform(point))) }];
                });
            }

            setTransformedHoles(stroke, sourceHoles, transform, scale = null) {
                if (!Array.isArray(sourceHoles) || !sourceHoles.length) return;
                stroke.holes = this.transformHoles(sourceHoles, transform, scale);
            }

            translateHoles(stroke, sourceHoles, dx, dy) {
                this.setTransformedHoles(stroke, sourceHoles, point => ({ x: point.x + dx, y: point.y + dy }));
            }

            rotateHoles(stroke, sourceHoles, center, angle) {
                const cos = Math.cos(angle);
                const sin = Math.sin(angle);
                this.setTransformedHoles(stroke, sourceHoles, point => {
                    const dx = point.x - center.x;
                    const dy = point.y - center.y;
                    return { x: center.x + dx * cos - dy * sin, y: center.y + dx * sin + dy * cos };
                });
            }

            scaleHoles(stroke, sourceHoles, oldBounds, newBounds) {
                const scaleX = oldBounds.w ? newBounds.w / oldBounds.w : 1;
                const scaleY = oldBounds.h ? newBounds.h / oldBounds.h : 1;
                this.setTransformedHoles(stroke, sourceHoles, point => ({
                    x: newBounds.x + (point.x - oldBounds.x) * scaleX,
                    y: newBounds.y + (point.y - oldBounds.y) * scaleY
                }), { x: scaleX, y: scaleY });
            }

            normalizeFrames(frames, legacyPaperStrokes = [], legacySharedStrokes = []) {
                const sourceFrames = Array.isArray(frames) && frames.length ? frames : [{ strokes: [] }];
                // Background art used to be one list shared by every frame. Each frame
                // now owns its background, so older shared art is copied into every
                // frame beneath that frame's own background art.
                const shared = Array.isArray(legacySharedStrokes) ? legacySharedStrokes : [];
                return sourceFrames.map((frame, index) => {
                    const paperSource = Array.isArray(frame.paperStrokes)
                        ? frame.paperStrokes
                        : (index === 0 ? this.cloneData(legacyPaperStrokes || []) : []);
                    return {
                        ...frame,
                        hold: Math.max(1, Math.min(12, Number.parseInt(frame.hold, 10) || 1)),
                        strokes: this.materializeErasers(Array.isArray(frame.strokes) ? frame.strokes : []).map(stroke => this.compactStrokeHoles(stroke)),
                        paperStrokes: this.materializeErasers([...this.cloneData(shared), ...paperSource]).map(stroke => this.compactStrokeHoles(stroke))
                    };
                });
            }

            materializeErasers(strokes) {
                const result = [];
                strokes.forEach(stroke => {
                    if (stroke && stroke.type === 'eraser') {
                        this.applyEraserStrokeToList(result, stroke);
                    } else {
                        result.push(stroke);
                    }
                });
                return result;
            }

            applyEraserStrokeToList(list, eraserStroke) {
                const points = eraserStroke.points || [];
                const radius = Math.max(0.5, (eraserStroke.size || this.brushSize) / 2);
                if (!points.length) return;

                if (points.length === 1) {
                    const p = points[0];
                    this.applyEraserSegmentToList(list, p, p, radius);
                    return;
                }

                for (let i = 0; i < points.length - 1; i++) {
                    this.applyEraserSegmentToList(list, points[i], points[i + 1], radius);
                }
            }

            applyEraserSegmentToList(list, from, to, radius) {
                const next = [];
                list.forEach(stroke => {
                    this.eraseStrokeWithSegment(stroke, from, to, radius).forEach(piece => next.push(piece));
                });
                list.splice(0, list.length, ...next);
            }

            getPaperStrokes(frame = this.frames[this.frameIndex]) {
                return Array.isArray(frame?.paperStrokes) ? frame.paperStrokes : [];
            }

            getActiveStrokeList() {
                const frame = this.frames[this.frameIndex];
                return this.activeLayer === 'ink' ? frame.strokes : frame.paperStrokes;
            }

            createMotionId() {
                this.motionTrackCounter += 1;
                return `motion-${Date.now().toString(36)}-${this.motionTrackCounter.toString(36)}`;
            }

            normalizeMotionTracks(tracks = []) {
                if (!Array.isArray(tracks)) return [];
                return tracks.map((raw, index) => {
                    const fallbackId = `motion-${index + 1}`;
                    const id = String(raw?.id || fallbackId);
                    const legacyInterpolation = raw?.interpolation === 'curved' ? 'curved' : 'straight';
                    const maxFrame = Math.max(0, this.frames.length - 1);
                    const startFrame = Math.max(0, Math.min(maxFrame, Number.parseInt(raw?.startFrame, 10) || 0));
                    const endFrame = Math.max(startFrame, Math.min(maxFrame, Number.parseInt(raw?.endFrame, 10) || startFrame));
                    const keyframes = (Array.isArray(raw?.keyframes) ? raw.keyframes : [])
                        .map((keyframe) => ({
                            frame: Math.max(0, Math.min(maxFrame, Number.parseInt(keyframe?.frame, 10) || 0)),
                            dx: Number.isFinite(Number(keyframe?.dx)) ? Number(keyframe.dx) : 0,
                            dy: Number.isFinite(Number(keyframe?.dy)) ? Number(keyframe.dy) : 0,
                            interpolation: keyframe?.interpolation === 'curved' || keyframe?.interpolation === 'straight'
                                ? keyframe.interpolation
                                : legacyInterpolation
                        }))
                        .filter((keyframe, keyIndex, all) => all.findIndex((candidate) => candidate.frame === keyframe.frame) === keyIndex)
                        .sort((a, b) => a.frame - b.frame);
                    const baseObject = this.cloneData(raw?.baseObject || raw?.object || null);
                    if (!baseObject) return null;
                    this.stripMotionMetadata(baseObject);
                    return {
                        id,
                        objectId: String(raw?.objectId || id),
                        layer: 'ink',
                        startFrame,
                        endFrame,
                        interpolation: legacyInterpolation,
                        stackIndex: Math.max(0, Number.parseInt(raw?.stackIndex, 10) || 0),
                        excludedFrames: [...new Set((Array.isArray(raw?.excludedFrames) ? raw.excludedFrames : [])
                            .map((frame) => Number.parseInt(frame, 10))
                            .filter((frame) => Number.isInteger(frame) && frame >= startFrame && frame <= endFrame))].sort((a, b) => a - b),
                        baseObject,
                        keyframes: keyframes.length ? keyframes : [{ frame: startFrame, dx: 0, dy: 0, interpolation: legacyInterpolation }]
                    };
                }).filter(Boolean);
            }

            stripMotionMetadata(object) {
                if (!object || typeof object !== 'object') return object;
                delete object.motionTrackId;
                if (object.type === 'group') (object.items || []).forEach((item) => this.stripMotionMetadata(item));
                return object;
            }

            getMotionTrack(id) {
                return this.motionTracks.find((track) => track.id === id) || null;
            }

            getMotionTrackForObject(object) {
                return this.getMotionTrack(object?.motionTrackId);
            }

            getMotionTrackForSelection() {
                if (!this.selectedObject) return null;
                if (this.selectedObject.isGroup && !this.selectedObject.isPersistentGroup) {
                    const trackedItem = this.selectedObject.items?.find((item) => item.stroke?.motionTrackId);
                    return this.getMotionTrackForObject(trackedItem?.stroke);
                }
                const stroke = this.selectedObject.isPersistentGroup
                    ? this.selectedObject.persistentGroupStroke
                    : this.selectedObject.stroke;
                return this.getMotionTrackForObject(stroke);
            }

            getMotionTrackEntriesForSelection() {
                const entries = [];
                const add = (stroke) => {
                    const track = this.getMotionTrackForObject(stroke);
                    if (!track || entries.some((entry) => entry.track.id === track.id)) return;
                    entries.push({ track, stroke });
                };
                if (!this.selectedObject) return entries;
                if (this.selectedObject.isPersistentGroup) add(this.selectedObject.persistentGroupStroke);
                if (this.selectedObject.isGroup) {
                    (this.selectedObject.items || []).forEach((item) => add(item.stroke));
                } else {
                    add(this.selectedObject.stroke);
                }
                return entries;
            }

            refreshMotionSelectionStroke(track) {
                if (!track || !this.selectedObject) return;
                const frameStrokes = this.frames[this.frameIndex]?.strokes || [];
                const stroke = frameStrokes.find((candidate) => candidate.motionTrackId === track.id)
                    || this.getMotionPreviewStroke(track);
                if (!stroke) return;

                if (this.selectedObject.isPersistentGroup && this.selectedObject.persistentGroupStroke?.motionTrackId === track.id) {
                    this.selectedObject.persistentGroupStroke = stroke;
                    this.selectedObject.items = (stroke.items || []).map((item, index) => ({ stroke: item, layer: 'ink', index }));
                    this.selectedObject.bounds = this.getStrokeBounds(stroke);
                    this.selectedObject.angle = stroke.angle || 0;
                } else if (this.selectedObject.isGroup) {
                    const item = this.selectedObject.items.find((candidate) => candidate.stroke?.motionTrackId === track.id);
                    if (item) item.stroke = stroke;
                    this.selectedObject.bounds = this.getGroupBounds(this.selectedObject.items);
                } else if (this.selectedObject.stroke?.motionTrackId === track.id) {
                    this.selectedObject.stroke = stroke;
                    this.calcBounds(stroke);
                }
            }

            commitMotionArtworkEdits() {
                if (this.tool === 'truck' || !this.selectedObject) return false;
                const entries = this.getMotionTrackEntriesForSelection();
                if (!entries.length) return false;

                entries.forEach(({ track, stroke }) => {
                    const base = this.cloneData(stroke);
                    const offset = this.getMotionOffset(track, this.frameIndex);
                    this.translateStrokeObject(base, -offset.dx, -offset.dy);
                    this.stripMotionMetadata(base);
                    track.baseObject = base;
                });
                entries.forEach(({ track }) => {
                    this.applyMotionTrack(track);
                    this.refreshMotionSelectionStroke(track);
                });
                this.updateGroupToolbar();
                this.saveStorage();
                return true;
            }

            bakeMotionTracksForSelection() {
                const entries = this.getMotionTrackEntriesForSelection();
                if (!entries.length) return false;
                return this.bakeMotionTracksByIds(entries.map(({ track }) => track.id));
            }

            bakeMotionTracksByIds(trackIds) {
                const ids = new Set((trackIds || []).filter(Boolean));
                if (!ids.size) return false;
                this.frames.forEach((frame) => {
                    (frame.strokes || []).forEach((stroke) => {
                        if (ids.has(stroke?.motionTrackId)) this.stripMotionMetadata(stroke);
                    });
                });
                this.motionTracks = this.motionTracks.filter((track) => !ids.has(track.id));
                if (ids.has(this.truckSelectedTrackId)) this.truckSelectedTrackId = null;
                return true;
            }

            motionDirectEditBlocked() {
                // Truck is the movement editor. Select remains the artwork editor,
                // even when the selected artwork also has a motion track.
                if (this.tool !== 'truck' || !this.getMotionTrackForSelection()) return false;
                this.showExportNotice('Use Motion to change how this artwork moves', true);
                return true;
            }

            translateStrokeObject(object, dx, dy) {
                if (!object || (!dx && !dy)) return object;
                if (object.type === 'group') {
                    (object.items || []).forEach((item) => this.translateStrokeObject(item, dx, dy));
                } else if (object.type === 'text') {
                    object.x += dx;
                    object.y += dy;
                } else {
                    (object.points || []).forEach((point) => { point.x += dx; point.y += dy; });
                }
                if (Array.isArray(object.holes)) this.translateHoles(object, object.holes, dx, dy);
                return object;
            }

            getMotionOffset(track, frameIndex = this.frameIndex) {
                const keys = [...(track?.keyframes || [])].sort((a, b) => a.frame - b.frame);
                if (!keys.length) return { dx: 0, dy: 0 };
                if (frameIndex <= keys[0].frame) return { dx: keys[0].dx, dy: keys[0].dy };
                if (frameIndex >= keys[keys.length - 1].frame) {
                    const last = keys[keys.length - 1];
                    return { dx: last.dx, dy: last.dy };
                }
                let rightIndex = keys.findIndex((keyframe) => keyframe.frame >= frameIndex);
                if (rightIndex < 1) rightIndex = 1;
                const left = keys[rightIndex - 1];
                const right = keys[rightIndex];
                const span = Math.max(1, right.frame - left.frame);
                const t = Math.max(0, Math.min(1, (frameIndex - left.frame) / span));
                const interpolation = right.interpolation || track.interpolation || 'straight';
                if (interpolation !== 'curved' || keys.length < 3) {
                    return {
                        dx: left.dx + (right.dx - left.dx) * t,
                        dy: left.dy + (right.dy - left.dy) * t
                    };
                }
                const prev = keys[rightIndex - 2] || left;
                const next = keys[rightIndex + 1] || right;
                const cubic = (p0, p1, p2, p3) => {
                    const c1 = p1 + (p2 - p0) / 6;
                    const c2 = p2 - (p3 - p1) / 6;
                    const value = (1 - t) ** 3 * p1 + 3 * (1 - t) ** 2 * t * c1 + 3 * (1 - t) * t ** 2 * c2 + t ** 3 * p2;
                    return Number.isFinite(value) ? value : p1;
                };
                return {
                    dx: cubic(prev.dx, left.dx, right.dx, next.dx),
                    dy: cubic(prev.dy, left.dy, right.dy, next.dy)
                };
            }

            setMotionTrackKeyframe(track, frameIndex, offset, apply = true) {
                if (!track) return;
                const frame = Math.max(0, Math.min(this.frames.length - 1, Number.parseInt(frameIndex, 10) || 0));
                const next = { frame, dx: Number(offset?.dx) || 0, dy: Number(offset?.dy) || 0 };
                const existing = track.keyframes.find((keyframe) => keyframe.frame === frame);
                if (existing) {
                    existing.dx = next.dx;
                    existing.dy = next.dy;
                } else {
                    next.interpolation = 'straight';
                    track.keyframes.push(next);
                    track.keyframes.sort((a, b) => a.frame - b.frame);
                }
                track.startFrame = Math.min(track.startFrame, frame);
                track.endFrame = Math.max(track.endFrame, frame);
                if (apply) this.applyMotionTrack(track);
            }

            applyMotionTrack(track) {
                if (!track?.baseObject) return;
                this.frames.forEach((frame) => {
                    frame.strokes = frame.strokes.filter((stroke) => stroke.motionTrackId !== track.id);
                });
                const start = Math.max(0, Math.min(this.frames.length - 1, track.startFrame));
                const end = Math.max(start, Math.min(this.frames.length - 1, track.endFrame));
                const excludedFrames = new Set(track.excludedFrames || []);
                for (let frameIndex = start; frameIndex <= end; frameIndex++) {
                    if (excludedFrames.has(frameIndex)) continue;
                    const copy = this.cloneData(track.baseObject);
                    const offset = this.getMotionOffset(track, frameIndex);
                    this.translateStrokeObject(copy, offset.dx, offset.dy);
                    copy.motionTrackId = track.id;
                    const insertAt = Math.min(this.frames[frameIndex].strokes.length, Math.max(0, track.stackIndex || 0));
                    this.frames[frameIndex].strokes.splice(insertAt, 0, copy);
                }
                if (this.tool === 'truck' && this.truckSelectedTrackId === track.id) this.selectMotionTrack(track.id, false);
            }

            selectMotionTrack(trackId, render = true) {
                const track = this.getMotionTrack(trackId);
                if (!track) return false;
                this.truckSelectedTrackId = track.id;
                const index = this.frames[this.frameIndex]?.strokes.findIndex((stroke) => stroke.motionTrackId === track.id) ?? -1;
                const stroke = index > -1 ? this.frames[this.frameIndex].strokes[index] : this.getMotionPreviewStroke(track);
                if (stroke) {
                    if (stroke.type === 'group') {
                        const bounds = this.getStrokeBounds(stroke);
                        this.selectedObject = {
                            isGroup: true,
                            isPersistentGroup: true,
                            persistentGroupStroke: stroke,
                            items: (stroke.items || []).map((item, itemIndex) => ({ stroke: item, layer: 'ink', index: itemIndex })),
                            bounds,
                            angle: stroke.angle || 0,
                            isMotionPreview: index < 0
                        };
                    } else {
                        this.selectedObject = { stroke, layer: 'ink', index, isMotionPreview: index < 0 };
                        this.calcBounds(stroke);
                    }
                }
                this.updateMotionPanel();
                if (render) this.renderCanvas();
                return true;
            }

            ensureFramesThrough(index) {
                const target = Math.max(0, Number.parseInt(index, 10) || 0);
                while (this.frames.length <= target) this.frames.push({ strokes: [], paperStrokes: [], hold: 1 });
            }

            remapMotionTracksAfterInsert(index, count = 1) {
                this.motionTracks.forEach((track) => {
                    if (track.startFrame >= index) track.startFrame += count;
                    if (track.endFrame >= index) track.endFrame += count;
                    track.keyframes.forEach((keyframe) => { if (keyframe.frame >= index) keyframe.frame += count; });
                    track.excludedFrames = (track.excludedFrames || []).map((frame) => frame >= index ? frame + count : frame);
                });
            }

            remapMotionTracksAfterDelete(index) {
                const removeIds = new Set();
                this.motionTracks.forEach((track) => {
                    const oldStart = track.startFrame;
                    const oldEnd = track.endFrame;
                    if (oldStart === index && oldEnd === index) {
                        removeIds.add(track.id);
                        return;
                    }
                    track.keyframes = track.keyframes
                        .filter((keyframe) => keyframe.frame !== index)
                        .map((keyframe) => ({ ...keyframe, frame: keyframe.frame > index ? keyframe.frame - 1 : keyframe.frame }));
                    track.excludedFrames = (track.excludedFrames || [])
                        .filter((frame) => frame !== index)
                        .map((frame) => frame > index ? frame - 1 : frame);
                    track.startFrame = oldStart > index ? oldStart - 1 : oldStart;
                    track.endFrame = oldEnd > index ? oldEnd - 1 : oldEnd === index ? Math.max(track.startFrame, index - 1) : oldEnd;
                    track.startFrame = Math.max(0, Math.min(this.frames.length - 1, track.startFrame));
                    track.endFrame = Math.max(track.startFrame, Math.min(this.frames.length - 1, track.endFrame));
                    if (!track.keyframes.length) track.keyframes.push({ frame: track.startFrame, dx: 0, dy: 0, interpolation: track.interpolation || 'straight' });
                });
                this.motionTracks = this.motionTracks.filter((track) => !removeIds.has(track.id) && track.startFrame <= track.endFrame);
                this.motionTracks.forEach((track) => this.applyMotionTrack(track));
            }

            remapMotionTracksAfterReorder(fromIndex, toIndex) {
                const mapIndex = (index) => {
                    if (index === fromIndex) return toIndex;
                    if (fromIndex < toIndex && index > fromIndex && index <= toIndex) return index - 1;
                    if (fromIndex > toIndex && index >= toIndex && index < fromIndex) return index + 1;
                    return index;
                };
                this.motionTracks.forEach((track) => {
                    const mappedStart = mapIndex(track.startFrame);
                    const mappedEnd = mapIndex(track.endFrame);
                    track.startFrame = Math.min(mappedStart, mappedEnd);
                    track.endFrame = Math.max(mappedStart, mappedEnd);
                    track.keyframes.forEach((keyframe) => { keyframe.frame = mapIndex(keyframe.frame); });
                    track.excludedFrames = (track.excludedFrames || []).map(mapIndex);
                    track.keyframes.sort((a, b) => a.frame - b.frame);
                });
                this.motionTracks.forEach((track) => this.applyMotionTrack(track));
            }

            getMotionPreviewStroke(track, frameIndex = this.frameIndex) {
                if (!track || frameIndex >= track.startFrame && frameIndex <= track.endFrame) return null;
                if ((track.excludedFrames || []).includes(frameIndex)) return null;
                const copy = this.cloneData(track.baseObject);
                const offset = this.getMotionOffset(track, frameIndex);
                this.translateStrokeObject(copy, offset.dx, offset.dy);
                copy.motionTrackId = track.id;
                return copy;
            }

            startMotion() {
                if (this.activeLayer !== 'ink') {
                    this.showExportNotice('Motion works on foreground artwork', true);
                    return false;
                }
                if (!this.selectedObject) {
                    this.showExportNotice('Select foreground artwork first', true);
                    return false;
                }
                const existing = this.getMotionTrackForSelection();
                if (existing) {
                    this.truckSelectedTrackId = existing.id;
                    this.updateMotionPanel();
                    return true;
                }
                this.saveState();
                const list = this.getActiveStrokeList();
                let source;
                let stackIndex = list.length;
                if (this.selectedObject.isGroup && !this.selectedObject.isPersistentGroup) {
                    const itemStrokes = this.selectedObject.items.map((item) => item.stroke);
                    stackIndex = Math.min(...itemStrokes.map((item) => list.indexOf(item)).filter((index) => index >= 0), list.length);
                    itemStrokes.forEach((item) => {
                        const itemIndex = list.indexOf(item);
                        if (itemIndex > -1) list.splice(itemIndex, 1);
                    });
                    source = { type: 'group', items: itemStrokes, angle: 0 };
                } else {
                    source = this.selectedObject.isPersistentGroup ? this.selectedObject.persistentGroupStroke : this.selectedObject.stroke;
                    const sourceIndex = list.indexOf(source);
                    stackIndex = sourceIndex > -1 ? sourceIndex : list.length;
                    if (sourceIndex > -1) list.splice(sourceIndex, 1);
                }
                const track = {
                    id: this.createMotionId(),
                    objectId: this.createMotionId(),
                    layer: 'ink',
                    startFrame: this.frameIndex,
                    endFrame: this.frameIndex,
                    interpolation: 'straight',
                    stackIndex,
                    excludedFrames: [],
                    baseObject: this.stripMotionMetadata(this.cloneData(source)),
                    keyframes: [{ frame: this.frameIndex, dx: 0, dy: 0, interpolation: 'straight' }]
                };
                this.motionTracks.push(track);
                this.truckSelectedTrackId = track.id;
                this.applyMotionTrack(track);
                this.renderUI();
                this.renderCanvas();
                this.saveStorage();
                return true;
            }

            addMotionKeyframe() {
                let track = this.getMotionTrackForSelection();
                if (!track) return this.startMotion();
                this.saveState();
                const offset = this.getMotionOffset(track, this.frameIndex);
                this.setMotionTrackKeyframe(track, this.frameIndex, offset);
                this.selectMotionTrack(track.id);
                this.renderUI(true);
                this.updateThumbnails();
                this.saveStorage();
                return true;
            }

            toggleMotionKeyframe() {
                const track = this.getMotionTrackForSelection();
                const hasKey = Boolean(track?.keyframes.some((keyframe) => keyframe.frame === this.frameIndex));
                return hasKey ? this.removeMotionKeyframe() : this.addMotionKeyframe();
            }

            removeMotionKeyframe() {
                const track = this.getMotionTrackForSelection();
                const frame = this.frameIndex;
                if (!track || !track.keyframes.some((keyframe) => keyframe.frame === frame)) return false;
                this.saveState();
                if (track.keyframes.length === 1) {
                    this.frames.forEach((currentFrame) => {
                        currentFrame.strokes = currentFrame.strokes.map((stroke) => {
                            if (stroke.motionTrackId !== track.id) return stroke;
                            return this.stripMotionMetadata(stroke);
                        });
                    });
                    this.motionTracks = this.motionTracks.filter((candidate) => candidate.id !== track.id);
                    this.truckSelectedTrackId = null;
                    if (this.selectedObject) this.selectedObject.isMotionPreview = false;
                } else {
                    track.keyframes = track.keyframes.filter((keyframe) => keyframe.frame !== frame);
                    // Keep the original span so removing an endpoint holds the
                    // remaining endpoint's position instead of deleting artwork.
                    this.applyMotionTrack(track);
                    this.selectMotionTrack(track.id, false);
                }
                this.renderUI(true);
                this.renderCanvas();
                this.updateThumbnails();
                this.saveStorage();
                return true;
            }

            setMotionKeyframe() {
                return this.addMotionKeyframe();
            }

            setMotionEndFrame(value) {
                const track = this.getMotionTrack(this.truckSelectedTrackId) || this.getMotionTrackForSelection();
                if (!track) return;
                const requested = Math.max(track.startFrame + 1, (Number.parseInt(value, 10) || track.endFrame + 1) - 1);
                this.saveState();
                const previousEndpoint = track.keyframes.find((keyframe) => keyframe.frame === track.endFrame) || {
                    ...this.getMotionOffset(track, track.endFrame), frame: track.endFrame
                };
                this.ensureFramesThrough(requested);
                track.endFrame = requested;
                track.keyframes = track.keyframes.filter((keyframe) => keyframe.frame < previousEndpoint.frame && keyframe.frame <= requested);
                track.excludedFrames = (track.excludedFrames || []).filter((frame) => frame >= track.startFrame && frame <= requested);
                this.setMotionTrackKeyframe(track, requested, previousEndpoint, false);
                this.applyMotionTrack(track);
                this.selectMotionTrack(track.id);
                this.renderUI();
                this.renderCanvas();
                this.saveStorage();
            }

            setMotionPath(value) {
                const track = this.getMotionTrackForSelection() || this.getMotionTrack(this.truckSelectedTrackId);
                if (!track) return;
                this.saveState();
                track.interpolation = value === 'curved' ? 'curved' : 'straight';
                track.keyframes.forEach((keyframe, index) => {
                    if (index > 0) keyframe.interpolation = track.interpolation;
                });
                this.applyMotionTrack(track);
                this.renderUI(true);
                this.renderMotionTracks();
                this.renderCanvas();
                this.updateThumbnails();
                this.saveStorage();
            }

            toggleMotionPreview() {
                this.togglePlay();
            }

            // Background images are replaced, never edited in place, so a snapshot
            // keeps a reference to the current one instead of copying its data.
            // Frame thumbnails are left out because undo and redo redraw them.
            // Frames are stored as one JSON string each. A frame that has not changed
            // since the previous snapshot reuses that snapshot's string, so undo
            // memory grows with the frames an edit touches rather than with the
            // whole project (a heavy 27-frame project used ~12 MB per edit).
            captureHistoryState() {
                const withoutThumbs = (key, value) => (key === 'thumb' ? undefined : value);
                const known = new Map((this.lastHistoryFrames || []).map((json) => [json, json]));
                const frames = this.frames.map((frame) => {
                    const json = JSON.stringify(frame, withoutThumbs);
                    return known.get(json) ?? json;
                });
                this.lastHistoryFrames = frames;
                const json = JSON.stringify({
                    motionTracks: this.motionTracks,
                    frameIndex: this.frameIndex,
                    bgColor: this.selectedBgColor,
                    width: this.canvasWidth,
                    height: this.canvasHeight,
                    palette: this.palette
                });
                return { frames, json, backgroundImage: this.backgroundImage };
            }

            // current is the snapshot of the state being left. Frames identical in
            // both keep their objects (and thumbnails); only changed frames are parsed.
            restoreHistoryState(entry, current) {
                const state = JSON.parse(entry.json);
                const sameLook = this.backgroundImage === (entry.backgroundImage || null) && this.selectedBgColor === state.bgColor &&
                    this.canvasWidth === state.width && this.canvasHeight === state.height;
                const unchanged = new Map();
                current.frames.forEach((json, index) => {
                    if (!unchanged.has(json)) unchanged.set(json, []);
                    unchanged.get(json).push(this.frames[index]);
                });
                this.backgroundImage = entry.backgroundImage || null;
                this.frames = entry.frames.map((json) => {
                    // Identical frames each need their own object, so one is used once.
                    const frame = unchanged.get(json)?.shift();
                    if (!frame) return this.normalizeFrames([JSON.parse(json)])[0];
                    if (!sameLook) delete frame.thumb;
                    return frame;
                });
                this.motionTracks = this.normalizeMotionTracks(state.motionTracks || []);
                this.frameIndex = state.frameIndex;
                this.selectedBgColor = state.bgColor;
                if (state.palette) { this.palette = state.palette; this.renderPalette(); }
                if (state.width && state.height) this.resizeCanvas(state.width, state.height);
                this.selectedObject = null;
                // Motion keeps the moving artwork selected, so its path and keys stay in view.
                if (this.tool === 'truck') {
                    if (this.getMotionTrack(this.truckSelectedTrackId)) this.selectMotionTrack(this.truckSelectedTrackId, false);
                    else this.truckSelectedTrackId = null;
                }
                this.renderCanvas();
                this.renderUI();
                this.saveStorage();
            }

            saveState() {
                // Frame selection is transient UI state; any document mutation
                // invalidates its old indexes before the history snapshot starts.
                this.clearFrameSelection();
                if (this.history.length > HISTORY_LIMIT) this.history.shift();
                this.redoStack = [];
                this.history.push(this.captureHistoryState());
            }

            undo() {
                if (this.history.length === 0) return false;
                this.clearFrameSelection(false);
                const current = this.captureHistoryState();
                this.redoStack.push(current);
                this.restoreHistoryState(this.history.pop(), current);
                return true;
            }

            redo() {
                if (this.redoStack.length === 0) return false;
                this.clearFrameSelection(false);
                const current = this.captureHistoryState();
                this.history.push(current);
                this.restoreHistoryState(this.redoStack.pop(), current);
                return true;
            }

            onDown(pos, pressure = 0.5, ctrlKey = false) {
                if (this.isPlaying) return;

                // ── Ctrl+Click multi-select (select tool only) ──────────────────
                if (ctrlKey && this.tool === 'select') {
                    const found = this.hitTest(pos);

                    // Helper: extract the raw stroke list for current layer
                    const list = this.getActiveStrokeList();

                    if (found) {
                        this.saveState();

                        // Case 1: Ctrl+click on a persistent group → add all its items into
                        // the working multi-select (flattening the group back out visually)
                        if (found.isPersistentGroup) {
                            const grp = found.stroke;
                            // Remove the group stroke from the layer and re-expand its items
                            const gIdx = list.indexOf(grp);
                            if (gIdx > -1) list.splice(gIdx, 1);
                            grp.items.forEach(s => list.push(s));

                            const newItems = grp.items.map((s, i) => ({ stroke: s, layer: found.layer, index: i }));

                            if (this.selectedObject && this.selectedObject.isGroup) {
                                // Merge into existing multi-select
                                newItems.forEach(ni => {
                                    const already = this.selectedObject.items.find(ex => ex.stroke === ni.stroke);
                                    if (!already) this.selectedObject.items.push(ni);
                                });
                                this.selectedObject.bounds = this.getGroupBounds(this.selectedObject.items);
                            } else if (this.selectedObject && !this.selectedObject.isGroup) {
                                // Upgrade single selection to multi
                                const existingItems = [{ stroke: this.selectedObject.stroke, layer: this.selectedObject.layer, index: this.selectedObject.index }];
                                newItems.forEach(ni => existingItems.push(ni));
                                this.selectedObject = { isGroup: true, items: existingItems, bounds: this.getGroupBounds(existingItems), angle: 0 };
                            } else {
                                // Nothing was selected — just select the expanded group items
                                this.selectedObject = { isGroup: true, items: newItems, bounds: this.getGroupBounds(newItems), angle: 0 };
                            }

                        } else {
                            // Case 2: Ctrl+click on a regular stroke
                            const clickedStroke = found.stroke;

                            if (this.selectedObject && this.selectedObject.isGroup && !this.selectedObject.isPersistentGroup) {
                                // Already have a temp multi-select — toggle this stroke in/out
                                const existingIdx = this.selectedObject.items.findIndex(i => i.stroke === clickedStroke);
                                if (existingIdx > -1) {
                                    // Deselect it
                                    this.selectedObject.items.splice(existingIdx, 1);
                                    if (this.selectedObject.items.length === 1) {
                                        // Collapse back to single selection
                                        const remaining = this.selectedObject.items[0];
                                        this.selectedObject = remaining;
                                        this.calcBounds(remaining.stroke);
                                    } else if (this.selectedObject.items.length === 0) {
                                        this.selectedObject = null;
                                    } else {
                                        this.selectedObject.bounds = this.getGroupBounds(this.selectedObject.items);
                                    }
                                } else {
                                    // Add it
                                    this.selectedObject.items.push(found);
                                    this.selectedObject.bounds = this.getGroupBounds(this.selectedObject.items);
                                }

                            } else if (this.selectedObject && !this.selectedObject.isGroup) {
                                // Upgrade single → multi
                                if (this.selectedObject.stroke === clickedStroke) {
                                    // Clicking the same object deselects it
                                    this.selectedObject = null;
                                } else {
                                    const items = [
                                        { stroke: this.selectedObject.stroke, layer: this.selectedObject.layer, index: this.selectedObject.index },
                                        found
                                    ];
                                    this.selectedObject = { isGroup: true, items, bounds: this.getGroupBounds(items), angle: 0 };
                                }

                            } else {
                                // Nothing selected — start fresh single selection
                                this.selectedObject = found;
                                this.calcBounds(found.stroke);
                            }
                        }
                    } else {
                        // Ctrl+click on empty space — clear selection
                        this.selectedObject = null;
                    }

                    this.renderCanvas();
                    return;
                }
                // ── End Ctrl+Click ───────────────────────────────────────────────

                if (this.tool === 'truck') {
                    this.hideMotionHint();
                    const onPath = this.hitMotionPath(pos);
                    if (onPath?.isKey) {
                        this.pathKeyDrag = { track: onPath.track, frame: onPath.frame, start: pos, offset: this.getMotionOffset(onPath.track, onPath.frame), moved: false };
                        this.canvas.style.cursor = 'grabbing';
                        return;
                    }
                    if (onPath) {
                        this.selectFrame(onPath.frame);
                        return;
                    }
                    let found = this.hitTest(pos);
                    const currentStroke = this.selectedObject?.isPersistentGroup
                        ? this.selectedObject.persistentGroupStroke
                        : this.selectedObject?.stroke;
                    if (found && (!this.selectedObject || found.stroke !== currentStroke)) {
                        if (found.isPersistentGroup) {
                            const group = found.stroke;
                            const bounds = this.getStrokeBounds(group);
                            this.selectedObject = {
                                isGroup: true,
                                isPersistentGroup: true,
                                persistentGroupStroke: group,
                                items: (group.items || []).map((item, index) => ({ stroke: item, layer: 'ink', index })),
                                bounds,
                                angle: group.angle || 0
                            };
                        } else {
                            this.selectedObject = found;
                            this.calcBounds(found.stroke);
                        }
                        const foundTrack = this.getMotionTrackForSelection();
                        this.truckSelectedTrackId = foundTrack?.id || null;
                        if (found.isMotionPreview) this.selectedObject.isMotionPreview = true;
                        this.updateMotionPanel();
                        this.renderMotionTracks();
                        this.renderCanvas();
                    } else if (!found && (!this.selectedObject || !this.isInBounds(pos, this.selectedObject.bounds))) {
                        this.selectedObject = null;
                        this.truckSelectedTrackId = null;
                        this.updateMotionPanel();
                        this.renderMotionTracks();
                        this.renderCanvas();
                        return;
                    }
                    if (!this.selectedObject || !this.isInBounds(pos, this.selectedObject.bounds)) return;
                    const track = this.getMotionTrackForSelection();
                    this.truckSelectedTrackId = track?.id || null;
                    this.dragMode = 'motion-move';
                    this.dragStart = pos;
                    this.dragTrack = track;
                    this.dragStartOffset = track ? this.getMotionOffset(track, this.frameIndex) : { dx: 0, dy: 0 };
                    this.motionDragSaved = false;
                    return;
                }

                if (this.tool === 'bucket') {
                    this.fillAt(pos);
                    return;
                }

                if (this.tool === 'text') {
                    this.openTextModal(pos);
                    return;
                }

                if (this.tool === 'select') {
                    if (this.selectedObject) {
                        const handle = this.hitTestHandles(pos);
                        if (handle) {
                            this.saveState();
                            this.dragMode = handle;
                            this.dragStart = pos;
                            this.motionDirectEditDirty = false;

                            if (this.selectedObject.isGroup) {
                                this.dragOriginalBounds = { ...this.selectedObject.bounds };
                                this.dragOriginalAngle = this.selectedObject.angle || 0;
                                // Always rotate around the center of the unrotated bounding box
                                // (same center drawObject uses for ctx.rotate on persistent groups)
                                this.dragCenter = {
                                    x: this.selectedObject.bounds.x + this.selectedObject.bounds.w / 2,
                                    y: this.selectedObject.bounds.y + this.selectedObject.bounds.h / 2
                                };
                                this.dragOriginalItems = this.selectedObject.items.map(item => {
                                    if (item.stroke.type === 'text') return { x: item.stroke.x, y: item.stroke.y, w: item.stroke.width, h: item.stroke.height, angle: item.stroke.angle || 0, holes: this.cloneData(item.stroke.holes || []) };
                                    return { points: item.stroke.points.map(p => ({ ...p })), sx: item.stroke.sx, sy: item.stroke.sy, angle: item.stroke.angle || 0, holes: this.cloneData(item.stroke.holes || []) };
                                });
                            } else if (this.selectedObject.stroke.type === 'text') {
                                this.dragOriginalProps = {
                                    x: this.selectedObject.stroke.x,
                                    y: this.selectedObject.stroke.y,
                                    w: this.selectedObject.stroke.width,
                                    h: this.selectedObject.stroke.height,
                                    sx: this.selectedObject.stroke.sx,
                                    sy: this.selectedObject.stroke.sy,
                                    angle: this.selectedObject.stroke.angle || 0
                                };
                                this.dragOriginalBounds = { ...this.selectedObject.bounds };
                                this.dragCenter = { x: this.selectedObject.bounds.x + this.selectedObject.bounds.w / 2, y: this.selectedObject.bounds.y + this.selectedObject.bounds.h / 2 };
                                this.dragOriginalHoles = this.cloneData(this.selectedObject.stroke.holes || []);
                            } else {
                                this.dragOriginalPoints = this.selectedObject.stroke.points.map(p => ({ ...p }));
                                const brushScale = this.getBrushScale(this.selectedObject.stroke);
                                this.dragOriginalScaleX = brushScale.x;
                                this.dragOriginalScaleY = brushScale.y;
                                this.dragOriginalAngle = this.selectedObject.stroke.angle || 0;
                                this.dragOriginalBounds = { ...this.selectedObject.bounds };
                                this.dragCenter = { x: this.selectedObject.bounds.x + this.selectedObject.bounds.w / 2, y: this.selectedObject.bounds.y + this.selectedObject.bounds.h / 2 };
                                this.dragOriginalHoles = this.cloneData(this.selectedObject.stroke.holes || []);
                            }
                            return;
                        }

                        if (this.isInBounds(pos, this.selectedObject.bounds)) {
                            this.saveState();
                            this.dragMode = 'move';
                            this.dragStart = pos;
                            this.motionDirectEditDirty = false;
                            this.dragOriginalBounds = { ...this.selectedObject.bounds };

                            if (this.selectedObject.isGroup) {
                                this.dragOriginalItems = this.selectedObject.items.map(item => {
                                    if (item.stroke.type === 'text') return { x: item.stroke.x, y: item.stroke.y, holes: this.cloneData(item.stroke.holes || []) };
                                    return { points: item.stroke.points.map(p => ({ ...p })), sx: item.stroke.sx, sy: item.stroke.sy, holes: this.cloneData(item.stroke.holes || []) };
                                });
                            } else if (this.selectedObject.stroke.type === 'text') {
                                this.dragOriginalProps = { x: this.selectedObject.stroke.x, y: this.selectedObject.stroke.y };
                                this.dragOriginalHoles = this.cloneData(this.selectedObject.stroke.holes || []);
                            } else {
                                this.dragOriginalPoints = this.selectedObject.stroke.points.map(p => ({ ...p }));
                                const brushScale = this.getBrushScale(this.selectedObject.stroke);
                                this.dragOriginalScaleX = brushScale.x;
                                this.dragOriginalScaleY = brushScale.y;
                                this.dragOriginalHoles = this.cloneData(this.selectedObject.stroke.holes || []);
                            }
                            return;
                        }
                    }

                    const found = this.hitTest(pos);
                    if (found) {
                        this.saveState();

                        if (found.isPersistentGroup) {
                            // Persistent group — wrap as isGroup selection so existing move/resize/rotate logic works
                            const grp = found.stroke;
                            // Compute bounds from raw item positions (ignoring angle) for the selection box
                            const bounds = this.getStrokeBounds(grp);
                            const items = grp.items.map((item, i) => ({ stroke: item, layer: found.layer, index: i }));
                            // The visual center is always the center of the unrotated bounding box —
                            // rotation is applied around this center by drawObject, so it stays stable.
                            const cx = bounds.x + bounds.w / 2;
                            const cy = bounds.y + bounds.h / 2;
                            this.selectedObject = {
                                isGroup: true,
                                isPersistentGroup: true,
                                persistentGroupStroke: grp,
                                items: items,
                                bounds: bounds,
                                angle: grp.angle || 0
                            };
                            this.dragOriginalBounds = { ...bounds };
                            this.dragOriginalAngle = grp.angle || 0;
                            this.dragCenter = { x: cx, y: cy };
                            this.dragOriginalItems = items.map(item => {
                                if (item.stroke.type === 'text') return { x: item.stroke.x, y: item.stroke.y, w: item.stroke.width, h: item.stroke.height, angle: item.stroke.angle || 0, holes: this.cloneData(item.stroke.holes || []) };
                                return { points: item.stroke.points.map(p => ({ ...p })), sx: item.stroke.sx, sy: item.stroke.sy, angle: item.stroke.angle || 0, holes: this.cloneData(item.stroke.holes || []) };
                            });
                        } else {
                            this.selectedObject = found;
                            this.calcBounds(found.stroke);
                            this.dragOriginalBounds = { ...this.selectedObject.bounds };
                            if (found.stroke.type === 'text') {
                                this.dragOriginalProps = { x: found.stroke.x, y: found.stroke.y };
                                this.dragOriginalHoles = this.cloneData(found.stroke.holes || []);
                            } else {
                                this.dragOriginalPoints = found.stroke.points.map(p => ({ ...p }));
                                const brushScale = this.getBrushScale(found.stroke);
                                this.dragOriginalScaleX = brushScale.x;
                                this.dragOriginalScaleY = brushScale.y;
                                this.dragOriginalHoles = this.cloneData(found.stroke.holes || []);
                            }
                        }
                        this.dragMode = 'move';
                        this.dragStart = pos;
                        this.motionDirectEditDirty = false;
                    } else {
                        this.isSelectingBox = true;
                        this.selectionStart = pos;
                        this.selectionCurr = pos;
                        this.selectedObject = null;
                    }
                    this.renderCanvas();
                    return;
                }

                this.saveState();
                this.isDrawing = true;
                this.quickLineActive = false;
                this.clearQuickLineTimer();
                this.selectedObject = null;
                this.dragStart = pos;

                const p = (typeof pressure === 'number') ? pressure : 0.5;

                this.currentStroke = {
                    type: this.tool,
                    brushType: this.brushType,
                    color: this.tool === 'eraser' ? '#ffffff' : this.brushColor,
                    size: this.brushSize,
                    opacity: this.opacity,
                    points: [{ x: pos.x, y: pos.y, p: p }],
                    fillColor: null,
                    sx: 1, sy: 1,
                    angle: 0,
                    symmetric: this.tool === 'brush' && this.symmetryEnabled
                };

                if (this.tool === 'eraser') {
                    this.eraseVectorBetween(pos, pos);
                    this.renderCanvas();
                    return;
                }

                const list = this.getActiveStrokeList();
                list.push(this.currentStroke);
                this.renderCanvas();
                this.queueQuickLine(pos, p);
            }

            onMove(pos, pressure = 0.5) {
                if (this.isPlaying) return;

                if (this.tool === 'truck') {
                    if (this.pathKeyDrag) {
                        this.dragPathKey(pos);
                        return;
                    }
                    if (this.dragMode !== 'motion-move') this.updatePathHover(pos);
                    if (this.dragMode === 'motion-move' && this.dragStart) {
                        const { dx, dy } = this.getMoveDelta(pos);
                        if (!dx && !dy && !this.motionDragSaved) return;
                        if (!this.dragTrack) {
                            if (!this.startMotion()) return;
                            this.dragTrack = this.getMotionTrackForSelection() || this.getMotionTrack(this.truckSelectedTrackId);
                            this.dragStartOffset = { dx: 0, dy: 0 };
                            this.motionDragSaved = true;
                        }
                        if (!this.dragTrack) return;
                        if (!this.motionDragSaved) {
                            this.saveState();
                            this.motionDragSaved = true;
                        }
                        this.setMotionTrackKeyframe(this.dragTrack, this.frameIndex, {
                            dx: this.dragStartOffset.dx + dx,
                            dy: this.dragStartOffset.dy + dy
                        });
                        this.truckSelectedTrackId = this.dragTrack.id;
                        this.updateMotionPanel();
                        this.renderCanvas();
                    }
                    return;
                }

                if (this.tool === 'select') {
                    if (this.isSelectingBox) {
                        this.selectionCurr = pos;
                        this.renderCanvas();
                        return;
                    }

                    if (this.dragMode && this.selectedObject) {
                        if (!this.dragStart) return;

                        if (this.selectedObject.isGroup) {
                            const bounds = this.dragOriginalBounds;
                            if (!bounds) return;

                            const { dx, dy } = this.getMoveDelta(pos);

                            if (this.dragMode === 'move') {
                                this.selectedObject.items.forEach((item, i) => {
                                    const orig = this.dragOriginalItems[i];
                                    if (!orig) return;
                                    if (item.stroke.type === 'text') {
                                        item.stroke.x = orig.x + dx;
                                        item.stroke.y = orig.y + dy;
                                    } else {
                                        const pts = item.stroke.points;
                                        for (let k = 0; k < pts.length; k++) {
                                            if (orig.points[k]) {
                                                pts[k].x = orig.points[k].x + dx;
                                                pts[k].y = orig.points[k].y + dy;
                                            }
                                        }
                                    }
                                    this.translateHoles(item.stroke, orig.holes, dx, dy);
                                });
                                this.selectedObject.bounds.x = bounds.x + dx;
                                this.selectedObject.bounds.y = bounds.y + dy;
                            } else if (this.dragMode === 'rotate') {
                                const startAngle = Math.atan2(this.dragStart.y - this.dragCenter.y, this.dragStart.x - this.dragCenter.x);
                                const currAngle = Math.atan2(pos.y - this.dragCenter.y, pos.x - this.dragCenter.x);
                                const angleDiff = currAngle - startAngle;
                                const newAngle = (this.dragOriginalAngle || 0) + angleDiff;

                                this.selectedObject.angle = newAngle;

                                if (this.selectedObject.isPersistentGroup) {
                                    // Persistent group: rotation is purely a canvas transform on the group stroke.
                                    // Do NOT physically move item points — drawObject handles it via ctx.rotate.
                                    this.selectedObject.persistentGroupStroke.angle = newAngle;
                                    this.selectedObject.items.forEach((item, i) => {
                                        const orig = this.dragOriginalItems[i];
                                        if (orig) this.rotateHoles(item.stroke, orig.holes, this.dragCenter, angleDiff);
                                    });
                                } else {
                                    // Temporary multi-select: physically rotate each item's points
                                    // (no canvas-level rotation available for these)
                                    const cos = Math.cos(angleDiff);
                                    const sin = Math.sin(angleDiff);
                                    const cx = this.dragCenter.x;
                                    const cy = this.dragCenter.y;

                                    this.selectedObject.items.forEach((item, i) => {
                                        const orig = this.dragOriginalItems[i];
                                        if (!orig) return;
                                        if (item.stroke.type === 'text') {
                                            const nx = orig.x - cx;
                                            const ny = orig.y - cy;
                                            item.stroke.x = (nx * cos - ny * sin) + cx;
                                            item.stroke.y = (nx * sin + ny * cos) + cy;
                                            item.stroke.angle = (orig.angle || 0) + angleDiff;
                                        } else {
                                            const pts = item.stroke.points;
                                            for (let k = 0; k < pts.length; k++) {
                                                if (orig.points[k]) {
                                                    const px = orig.points[k].x - cx;
                                                    const py = orig.points[k].y - cy;
                                                    pts[k].x = (px * cos - py * sin) + cx;
                                                    pts[k].y = (px * sin + py * cos) + cy;
                                                }
                                            }
                                        }
                                        this.rotateHoles(item.stroke, orig.holes, { x: cx, y: cy }, angleDiff);
                                    });
                                }
                            } else if (this.dragMode.startsWith('resize')) {
                                const resized = this.getResizeBounds(bounds, this.dragMode, pos);
                                const newX = resized.x;
                                const newY = resized.y;
                                const newW = resized.w;
                                const newH = resized.h;

                                const scaleX = newW / bounds.w;
                                const scaleY = newH / bounds.h;

                                this.selectedObject.items.forEach((item, i) => {
                                    const orig = this.dragOriginalItems[i];
                                    if (!orig) return;
                                    if (item.stroke.type === 'text') {
                                        const relX = orig.x - bounds.x;
                                        const relY = orig.y - bounds.y;
                                        item.stroke.x = newX + relX * scaleX;
                                        item.stroke.y = newY + relY * scaleY;
                                    } else {
                                        const pts = item.stroke.points;
                                        for (let k = 0; k < pts.length; k++) {
                                            if (orig.points[k]) {
                                                const relX = orig.points[k].x - bounds.x;
                                                const relY = orig.points[k].y - bounds.y;
                                                pts[k].x = newX + relX * scaleX;
                                                pts[k].y = newY + relY * scaleY;
                                            }
                                        }
                                        if (this.scalesLineWidth(item.stroke)) {
                                            const originalScale = this.getBrushScale(orig);
                                            item.stroke.sx = originalScale.x * scaleX;
                                            item.stroke.sy = originalScale.y * scaleY;
                                        }
                                    }
                                    this.scaleHoles(item.stroke, orig.holes, bounds, { x: newX, y: newY, w: newW, h: newH });
                                });
                                this.selectedObject.bounds = { x: newX, y: newY, w: newW, h: newH };
                            }
                            this.renderCanvas();
                            this.motionDirectEditDirty = true;
                            return;
                        }

                        const stroke = this.selectedObject.stroke;
                        const bounds = this.dragOriginalBounds;

                        if (this.dragMode === 'move') {
                            const { dx, dy } = this.getMoveDelta(pos);

                            if (stroke.type === 'text') {
                                stroke.x = this.dragOriginalProps.x + dx;
                                stroke.y = this.dragOriginalProps.y + dy;
                            } else {
                                const pts = stroke.points;
                                const origPts = this.dragOriginalPoints;
                                for (let i = 0; i < pts.length; i++) {
                                    if (origPts[i]) {
                                        pts[i].x = origPts[i].x + dx;
                                        pts[i].y = origPts[i].y + dy;
                                    }
                                }
                            }
                            this.translateHoles(stroke, this.dragOriginalHoles, dx, dy);
                        } else if (this.dragMode === 'rotate') {
                            const startAngle = Math.atan2(this.dragStart.y - this.dragCenter.y, this.dragStart.x - this.dragCenter.x);
                            const currAngle = Math.atan2(pos.y - this.dragCenter.y, pos.x - this.dragCenter.x);
                            const angleDiff = currAngle - startAngle;

                            if (stroke.type === 'text') {
                                stroke.angle = (this.dragOriginalProps.angle || 0) + angleDiff;
                            } else {
                                stroke.angle = (this.dragOriginalAngle || 0) + angleDiff;
                            }
                            this.rotateHoles(stroke, this.dragOriginalHoles, this.dragCenter, angleDiff);
                        } else {
                            if (!bounds) return;

                            const resized = this.getResizeBounds(bounds, this.dragMode, pos);
                            const newX = resized.x;
                            const newY = resized.y;
                            const newW = resized.w;
                            const newH = resized.h;

                            if (stroke.type === 'text') {
                                stroke.sx = newW / this.dragOriginalProps.w;
                                stroke.sy = newH / this.dragOriginalProps.h;
                                stroke.x = this.dragOriginalProps.x + (newX - bounds.x);
                                stroke.y = this.dragOriginalProps.y + (newY - bounds.y);
                            } else if (stroke.points.length === 1) {
                                const originalScaleX = Number.isFinite(this.dragOriginalScaleX) ? this.dragOriginalScaleX : this.getBrushScale(stroke).x;
                                const originalScaleY = Number.isFinite(this.dragOriginalScaleY) ? this.dragOriginalScaleY : this.getBrushScale(stroke).y;
                                stroke.sx = originalScaleX * (newW / this.dragOriginalBounds.w);
                                stroke.sy = originalScaleY * (newH / this.dragOriginalBounds.h);
                                stroke.points[0].x = newX + newW / 2;
                                stroke.points[0].y = newY + newH / 2;
                            } else {
                                const pts = stroke.points;
                                const origPts = this.dragOriginalPoints;
                                for (let i = 0; i < pts.length; i++) {
                                    if (origPts[i]) {
                                        const normX = (origPts[i].x - bounds.x) / bounds.w;
                                        const normY = (origPts[i].y - bounds.y) / bounds.h;
                                        pts[i].x = newX + (normX * newW);
                                        pts[i].y = newY + (normY * newH);
                                    }
                                }
                                if (this.scalesLineWidth(stroke)) {
                                    const originalScaleX = Number.isFinite(this.dragOriginalScaleX) ? this.dragOriginalScaleX : this.getBrushScale(stroke).x;
                                    const originalScaleY = Number.isFinite(this.dragOriginalScaleY) ? this.dragOriginalScaleY : this.getBrushScale(stroke).y;
                                    stroke.sx = originalScaleX * (newW / bounds.w);
                                    stroke.sy = originalScaleY * (newH / bounds.h);
                                }
                            }
                            this.scaleHoles(stroke, this.dragOriginalHoles, bounds, { x: newX, y: newY, w: newW, h: newH });
                        }
                        this.calcBounds(this.selectedObject.stroke);
                        this.motionDirectEditDirty = true;
                        this.renderCanvas();
                    }
                    return;
                }

                if (this.isDrawing && this.currentStroke) {
                    if (this.tool === 'eraser') {
                        const p = (typeof pressure === 'number') ? pressure : 0.5;
                        const prev = this.currentStroke.points[this.currentStroke.points.length - 1];
                        this.currentStroke.points.push({ x: pos.x, y: pos.y, p: p });
                        this.eraseVectorBetween(prev, pos);
                        this.renderCanvas();
                        return;
                    }

                    if (this.tool === 'brush') {
                        const p = (typeof pressure === 'number') ? pressure : 0.5;
                        if (this.quickLineActive) {
                            this.setQuickLineEnd(pos, p);
                        } else {
                            this.currentStroke.points.push({ x: pos.x, y: pos.y, p: p });
                            this.queueQuickLine(pos, p);
                        }
                    } else {
                        const start = this.dragStart;
                        if (!start) return;

                        const end = pos;
                        if (this.tool === 'line') {
                            this.currentStroke.points = [{ x: start.x, y: start.y, p: 0.5 }, { x: end.x, y: end.y, p: 0.5 }];
                        } else if (this.tool === 'rect') {
                            this.currentStroke.points = [
                                { x: start.x, y: start.y, p: 0.5 }, { x: end.x, y: start.y, p: 0.5 },
                                { x: end.x, y: end.y, p: 0.5 }, { x: start.x, y: end.y, p: 0.5 },
                                { x: start.x, y: start.y, p: 0.5 }
                            ];
                        } else if (this.tool === 'circle') {
                            const rx = (end.x - start.x) / 2;
                            const ry = (end.y - start.y) / 2;
                            const cx = start.x + rx;
                            const cy = start.y + ry;
                            const segments = 32;
                            const pts = [];
                            for (let i = 0; i <= segments; i++) {
                                const theta = (i / segments) * Math.PI * 2;
                                pts.push({ x: cx + rx * Math.cos(theta), y: cy + ry * Math.sin(theta), p: 0.5 });
                            }
                            this.currentStroke.points = pts;
                        }
                    }
                    this.scheduleRender();
                }
            }

            selectStrokes(predicate) {
                const items = [];
                this.getActiveStrokeList().forEach((stroke, index) => {
                    if (predicate(stroke)) items.push({ stroke, layer: this.activeLayer, index });
                });
                if (items.length === 1) {
                    this.selectedObject = items[0];
                    this.calcBounds(items[0].stroke);
                } else if (items.length > 1) {
                    this.selectedObject = {
                        isGroup: true,
                        items,
                        bounds: this.getGroupBounds(items),
                        angle: 0
                    };
                }
                return items.length;
            }

            selectAll() {
                if (this.isPlaying) return false;
                if (this.tool !== 'select') this.setTool('select');
                this.selectedObject = null;
                const count = this.selectStrokes(() => true);
                this.renderCanvas();
                return count > 0;
            }

            updateSelectionMarquee() {
                const marquee = document.getElementById('selection-marquee');
                if (!marquee) return;
                if (!this.isSelectingBox) {
                    marquee.hidden = true;
                    return;
                }
                // Drawn over the workspace rather than on the canvas so the box stays
                // visible when it is dragged beyond the canvas edge.
                const rect = this.canvas.getBoundingClientRect();
                const scaleX = rect.width / this.canvasWidth;
                const scaleY = rect.height / this.canvasHeight;
                const x = Math.min(this.selectionStart.x, this.selectionCurr.x);
                const y = Math.min(this.selectionStart.y, this.selectionCurr.y);
                marquee.style.left = `${rect.left + x * scaleX}px`;
                marquee.style.top = `${rect.top + y * scaleY}px`;
                marquee.style.width = `${Math.abs(this.selectionCurr.x - this.selectionStart.x) * scaleX}px`;
                marquee.style.height = `${Math.abs(this.selectionCurr.y - this.selectionStart.y) * scaleY}px`;
                marquee.hidden = false;
            }

            onUp() {
                if (this.pathKeyDrag) {
                    this.finishPathKeyDrag();
                    return;
                }
                if (this.isSelectingBox) {
                    this.isSelectingBox = false;

                    const x1 = Math.min(this.selectionStart.x, this.selectionCurr.x);
                    const y1 = Math.min(this.selectionStart.y, this.selectionCurr.y);
                    const x2 = Math.max(this.selectionStart.x, this.selectionCurr.x);
                    const y2 = Math.max(this.selectionStart.y, this.selectionCurr.y);
                    const selBox = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };

                    if (selBox.w > 2 || selBox.h > 2) {
                        this.selectStrokes((stroke) => this.rectIntersect(selBox, this.getStrokeBounds(stroke)));
                    }
                    this.renderCanvas();
                }

                if (this.isDrawing) {
                    this.clearQuickLineTimer();
                    if (!this.quickLineActive && this.tool === 'brush' && this.currentStroke.points.length > 5) {
                        this.currentStroke.points = this.simplifyPoints(this.currentStroke.points, 1.5);
                    }
                    this.isDrawing = false;
                    this.quickLineActive = false;
                    this.currentStroke = null;
                    this.renderCanvas();
                    this.updateThumbnails([this.frameIndex]);
                    this.saveStorage();
                    if (this.tool !== 'eraser') this.guideEvent('stroke');
                }
                if (this.dragMode) {
                    const finishedDragMode = this.dragMode;
                    if (finishedDragMode !== 'motion-move' && this.motionDirectEditDirty) {
                        this.commitMotionArtworkEdits();
                    }
                    this.dragMode = null;
                    this.updateEditedThumbnails();
                    if (finishedDragMode === 'motion-move') this.renderMotionTracks();
                    this.saveStorage();
                    this.dragTrack = null;
                    this.dragStart = null;
                    this.dragStartOffset = null;
                    this.motionDragSaved = false;
                    this.motionDirectEditDirty = false;
                }
                if (this.draggedFrameIndex !== null) {
                    this.draggedFrameIndex = null;
                    document.querySelectorAll('.frame-card').forEach(el => el.classList.remove('drag-over'));
                }
            }

            clearQuickLineTimer() {
                if (this.quickLineTimer) {
                    clearTimeout(this.quickLineTimer);
                    this.quickLineTimer = null;
                }
            }

            queueQuickLine(pos, pressure = 0.5) {
                if (!this.currentStroke || !['brush', 'eraser'].includes(this.tool)) return;
                this.clearQuickLineTimer();
                this.quickLineEnd = { x: pos.x, y: pos.y, p: pressure };
                this.quickLineTimer = setTimeout(() => this.activateQuickLine(), this.quickLineDelay);
            }

            activateQuickLine() {
                if (!this.isDrawing || !this.currentStroke || this.quickLineActive) return;
                const start = this.currentStroke.points[0];
                const end = this.quickLineEnd || this.currentStroke.points[this.currentStroke.points.length - 1];
                if (!start || !end) return;

                const dist = Math.hypot(end.x - start.x, end.y - start.y);
                if (dist < this.quickLineMinDistance) return;

                this.quickLineActive = true;
                this.setQuickLineEnd(end, end.p);
                this.renderCanvas();
            }

            setQuickLineEnd(pos, pressure = 0.5) {
                if (!this.currentStroke || !this.currentStroke.points.length) return;
                const start = this.currentStroke.points[0];
                this.currentStroke.points = [
                    { x: start.x, y: start.y, p: start.p !== undefined ? start.p : 0.5 },
                    { x: pos.x, y: pos.y, p: pressure !== undefined ? pressure : 0.5 }
                ];
                this.quickLineEnd = { x: pos.x, y: pos.y, p: pressure };
            }

            simplifyPoints(points, tolerance) {
                if (points.length <= 2) return points;
                const newPoints = [points[0]];
                let lastPoint = points[0];
                for (let i = 1; i < points.length - 1; i++) {
                    const p = points[i];
                    const dist = Math.hypot(p.x - lastPoint.x, p.y - lastPoint.y);
                    if (dist > tolerance) { newPoints.push(p); lastPoint = p; }
                }
                newPoints.push(points[points.length - 1]);
                return newPoints;
            }

            eraseVectorBetween(from, to) {
                const list = this.getActiveStrokeList();
                const radius = Math.max(0.5, this.brushSize / 2);
                const next = [];
                let changed = false;

                // Erasing is an artwork edit, not a movement edit. Bake any
                // animated artwork the gesture touches into its existing frames
                // before applying the erase so the edit is retained safely.
                const touchedTracks = [...new Set(list
                    .filter((stroke) => stroke?.motionTrackId && this.eraserIntersectsBounds(this.getStrokeBounds(stroke), from, to, radius))
                    .map((stroke) => stroke.motionTrackId))];
                if (touchedTracks.length) this.bakeMotionTracksByIds(touchedTracks);

                list.forEach(stroke => {
                    const pieces = this.eraseStrokeWithSegment(stroke, from, to, radius);
                    if (pieces.length !== 1 || pieces[0] !== stroke) changed = true;
                    pieces.forEach(piece => next.push(piece));
                });

                if (changed) {
                    list.splice(0, list.length, ...next);
                    this.selectedObject = null;
                }
            }

            eraseStrokeWithSegment(stroke, from, to, radius, holeFrom = from, holeTo = to) {
                if (!stroke) return [];
                if (stroke.motionTrackId) {
                    return [stroke];
                }

                if (stroke.type === 'group') {
                    const keptItems = [];
                    const groupSegment = this.inverseRotateSegment(stroke, from, to);
                    stroke.items.forEach(item => {
                        this.eraseStrokeWithSegment(item, groupSegment.from, groupSegment.to, radius, holeFrom, holeTo).forEach(piece => keptItems.push(piece));
                    });
                    if (!keptItems.length) return [];
                    if (keptItems.length === stroke.items.length && keptItems.every((item, index) => item === stroke.items[index])) return [stroke];
                    const nextGroup = this.cloneData(stroke);
                    nextGroup.items = keptItems;
                    return [nextGroup];
                }

                if (stroke.type === 'text') {
                    const textSegment = this.inverseRotateSegment(stroke, from, to);
                    if (!this.eraserIntersectsBounds(this.getStrokeBounds(stroke), textSegment.from, textSegment.to, radius)) return [stroke];
                    const next = this.cloneData(stroke);
                    this.addEraserHole(next, holeFrom, holeTo, radius);
                    return [next];
                }

                if (!stroke.points || !stroke.points.length) return [stroke];

                const pointScale = stroke.points.length === 1
                    ? Math.max(Math.abs(stroke.sx || 1), Math.abs(stroke.sy || 1))
                    : 1;
                const brushScale = this.scalesLineWidth(stroke) ? this.getBrushScale(stroke) : { x: 1, y: 1 };
                const brushRadius = Math.max(
                    1,
                    this.getSinglePointDiameter(stroke) * Math.max(pointScale, brushScale.x, brushScale.y) / 2
                );
                const hitRadius = radius + brushRadius;

                const fillSegment = this.inverseRotateSegment(stroke, from, to);
                const mid = { x: (fillSegment.from.x + fillSegment.to.x) / 2, y: (fillSegment.from.y + fillSegment.to.y) / 2 };
                const mirroredStroke = stroke.symmetric && stroke.type === 'brush' ? this.getMirroredStroke(stroke) : null;
                const mirroredFillSegment = mirroredStroke ? this.inverseRotateSegment(mirroredStroke, from, to) : null;
                const mirroredMid = mirroredFillSegment ? {
                    x: (mirroredFillSegment.from.x + mirroredFillSegment.to.x) / 2,
                    y: (mirroredFillSegment.from.y + mirroredFillSegment.to.y) / 2
                } : null;
                const intersects = this.strokeIntersectsEraser(stroke, from, to, hitRadius) ||
                    (mirroredStroke && this.strokeIntersectsEraser(mirroredStroke, from, to, hitRadius)) ||
                    (stroke.fillColor && (this.containsPoint(stroke.points, mid) || this.containsPoint(stroke.points, fillSegment.from))) ||
                    (mirroredStroke?.fillColor && (this.containsPoint(mirroredStroke.points, mirroredMid) || this.containsPoint(mirroredStroke.points, mirroredFillSegment.from)));
                if (!intersects) return [stroke];

                // Preserve the original geometry. The eraser footprint is drawn as
                // a hole, so a thick or translucent stroke cannot remove a whole
                // stored segment just because its centerline was touched.
                const next = this.cloneData(stroke);
                this.addEraserHole(next, holeFrom, holeTo, radius);
                return [next];
            }

            inverseRotateSegment(stroke, from, to) {
                if (!stroke?.angle) return { from, to };
                const bounds = this.getStrokeBounds(stroke);
                const cx = bounds.x + bounds.w / 2;
                const cy = bounds.y + bounds.h / 2;
                const cos = Math.cos(-stroke.angle);
                const sin = Math.sin(-stroke.angle);
                const toLocal = (point) => {
                    const dx = point.x - cx;
                    const dy = point.y - cy;
                    return {
                        x: cx + dx * cos - dy * sin,
                        y: cy + dx * sin + dy * cos
                    };
                };
                return { from: toLocal(from), to: toLocal(to) };
            }

            strokeIntersectsEraser(stroke, from, to, radius) {
                if (!stroke.points || !stroke.points.length) return false;
                ({ from, to } = this.inverseRotateSegment(stroke, from, to));
                if (stroke.points.some(p => this.distToSegment(p, from, to) <= radius)) return true;
                for (let i = 0; i < stroke.points.length - 1; i++) {
                    if (this.segmentsNear(stroke.points[i], stroke.points[i + 1], from, to, radius)) return true;
                }
                return false;
            }

            buildEraserHole(from, to, radius) {
                const dx = to.x - from.x;
                const dy = to.y - from.y;
                const len = Math.hypot(dx, dy) || 1;
                const ux = dx / len;
                const uy = dy / len;
                const px = -uy;
                const py = ux;
                const segs = 12;
                const pts = [];

                const arc = (center, startAngle, sweep) => {
                    for (let i = 0; i <= segs; i++) {
                        const a = startAngle + (sweep * i) / segs;
                        pts.push({ x: center.x + Math.cos(a) * radius, y: center.y + Math.sin(a) * radius });
                    }
                };

                const startAngle = Math.atan2(py, px);
                arc(from, startAngle, Math.PI);
                arc(to, startAngle + Math.PI, Math.PI);
                return pts;
            }

            eraserIntersectsBounds(bounds, from, to, radius) {
                const expanded = {
                    x: bounds.x - radius,
                    y: bounds.y - radius,
                    w: bounds.w + radius * 2,
                    h: bounds.h + radius * 2
                };
                if (this.pointInRect(from, expanded) || this.pointInRect(to, expanded)) return true;
                const corners = [
                    { x: expanded.x, y: expanded.y },
                    { x: expanded.x + expanded.w, y: expanded.y },
                    { x: expanded.x + expanded.w, y: expanded.y + expanded.h },
                    { x: expanded.x, y: expanded.y + expanded.h }
                ];
                for (let i = 0; i < corners.length; i++) {
                    if (this.segmentsIntersect(from, to, corners[i], corners[(i + 1) % corners.length])) return true;
                }
                return false;
            }

            pointInRect(point, rect) {
                return point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h;
            }

            segmentsNear(a, b, c, d, radius) {
                if (this.segmentsIntersect(a, b, c, d)) return true;
                return this.distToSegment(a, c, d) <= radius ||
                    this.distToSegment(b, c, d) <= radius ||
                    this.distToSegment(c, a, b) <= radius ||
                    this.distToSegment(d, a, b) <= radius;
            }

            segmentsIntersect(a, b, c, d) {
                const orient = (p, q, r) => (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
                const onSegment = (p, q, r) =>
                    q.x <= Math.max(p.x, r.x) && q.x >= Math.min(p.x, r.x) &&
                    q.y <= Math.max(p.y, r.y) && q.y >= Math.min(p.y, r.y);
                const o1 = orient(a, b, c);
                const o2 = orient(a, b, d);
                const o3 = orient(c, d, a);
                const o4 = orient(c, d, b);
                if (o1 * o2 < 0 && o3 * o4 < 0) return true;
                if (Math.abs(o1) < 0.0001 && onSegment(a, c, b)) return true;
                if (Math.abs(o2) < 0.0001 && onSegment(a, d, b)) return true;
                if (Math.abs(o3) < 0.0001 && onSegment(c, a, d)) return true;
                if (Math.abs(o4) < 0.0001 && onSegment(c, b, d)) return true;
                return false;
            }

            hitTest(pos) {
                const checkList = (list, layerName) => {
                    for (let i = list.length - 1; i >= 0; i--) {
                        const obj = list[i];
                        // Handle persistent group objects stored in strokes array
                        if (obj.type === 'group') {
                            const b = this.getStrokeBounds(obj);
                            // Unrotate pos if group has angle
                            let checkPos = pos;
                            if (obj.angle) {
                                const cx = b.x + b.w / 2;
                                const cy = b.y + b.h / 2;
                                const dx = pos.x - cx;
                                const dy = pos.y - cy;
                                const ang = -obj.angle;
                                checkPos = {
                                    x: cx + dx * Math.cos(ang) - dy * Math.sin(ang),
                                    y: cy + dx * Math.sin(ang) + dy * Math.cos(ang)
                                };
                            }
                            if (checkPos.x >= b.x && checkPos.x <= b.x + b.w &&
                                checkPos.y >= b.y && checkPos.y <= b.y + b.h) {
                                // Return as a persistent group selection
                                return { stroke: obj, layer: layerName, index: i, isPersistentGroup: true };
                            }
                            continue;
                        }
                        if (obj.type === 'text') {
                            const w = obj.width * obj.sx;
                            const h = obj.height * obj.sy;
                            const bx = obj.x;
                            const by = obj.y - h;
                            if (obj.angle) {
                                const cx = bx + w / 2;
                                const cy = by + h / 2;
                                const dx = pos.x - cx;
                                const dy = pos.y - cy;
                                const ang = -obj.angle;
                                const rx = cx + dx * Math.cos(ang) - dy * Math.sin(ang);
                                const ry = cy + dx * Math.sin(ang) + dy * Math.cos(ang);
                                if (rx >= bx && rx <= bx + w && ry >= by && ry <= by + h + 10) return { stroke: obj, layer: layerName, index: i };
                            } else {
                                if (pos.x >= bx && pos.x <= bx + w && pos.y >= by && pos.y <= by + h + 10) {
                                    return { stroke: obj, layer: layerName, index: i };
                                }
                            }
                        } else {
                            if (this.strokeHit(obj, pos)) return { stroke: obj, layer: layerName, index: i };
                        }
                    }
                    return null;
                };
                if (this.activeLayer === 'ink') {
                    const found = checkList(this.frames[this.frameIndex].strokes, 'ink');
                    if (found) return found;
                    if (this.tool === 'truck' && !this.isPlaying && this.activeLayer === 'ink' && this.truckSelectedTrackId) {
                        const track = this.getMotionTrack(this.truckSelectedTrackId);
                        const preview = this.getMotionPreviewStroke(track);
                        if (preview) {
                            const foundPreview = checkList([preview], 'ink');
                            if (foundPreview) return { ...foundPreview, index: -1, isMotionPreview: true };
                        }
                    }
                    return null;
                }
                return checkList(this.getPaperStrokes(), 'paper');
            }

            strokeHit(stroke, pos) {
                if (!stroke.points || stroke.points.length === 0) return false;
                const scale = this.scalesLineWidth(stroke) ? this.getBrushScale(stroke) : { x: 1, y: 1 };
                const hitThreshX = Math.max(10, (stroke.size || 0) * scale.x);
                const hitThreshY = Math.max(10, (stroke.size || 0) * scale.y);
                const hitThresh = Math.max(hitThreshX, hitThreshY);

                let checkPos = pos;
                if (stroke.angle) {
                    const b = this.getStrokeBounds(stroke);
                    const cx = b.x + b.w / 2;
                    const cy = b.y + b.h / 2;
                    const dx = pos.x - cx;
                    const dy = pos.y - cy;
                    const ang = -stroke.angle;
                    checkPos = {
                        x: cx + dx * Math.cos(ang) - dy * Math.sin(ang),
                        y: cy + dx * Math.sin(ang) + dy * Math.cos(ang)
                    };
                }

                if (stroke.type === 'fill') return this.containsPoint(stroke.points, checkPos);

                if (stroke.points.length === 1) {
                    const p = stroke.points[0];
                    const dist = Math.hypot(checkPos.x - p.x, checkPos.y - p.y);
                    const pointScale = this.getBrushScale(stroke);
                    const maxDim = Math.max(pointScale.x, pointScale.y) * (this.getSinglePointDiameter(stroke) / 2);
                    return dist < maxDim + 10;
                }

                let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
                stroke.points.forEach(p => { if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x; if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y; });
                if (checkPos.x < minX - hitThreshX || checkPos.x > maxX + hitThreshX || checkPos.y < minY - hitThreshY || checkPos.y > maxY + hitThreshY) return false;

                for (let i = 0; i < stroke.points.length - 1; i++) {
                    if (this.distToSegment(checkPos, stroke.points[i], stroke.points[i + 1]) < hitThresh) return true;
                }

                if (stroke.fillColor || (this.tool === 'bucket' && (stroke.type === 'rect' || stroke.type === 'circle'))) {
                    if (this.containsPoint(stroke.points, checkPos)) return true;
                }
                return false;
            }

            // Even-odd test. Bucket fills hold several outlines (the area and its
            // holes); each outline starts at a point marked m.
            containsPoint(points, pos) {
                let inside = false;
                let start = 0;
                for (let end = 1; end <= points.length; end++) {
                    if (end < points.length && !points[end].m) continue;
                    for (let i = start, j = end - 1; i < end; j = i++) {
                        const xi = points[i].x, yi = points[i].y;
                        const xj = points[j].x, yj = points[j].y;
                        const intersect = ((yi > pos.y) !== (yj > pos.y)) && (pos.x < (xj - xi) * (pos.y - yi) / (yj - yi) + xi);
                        if (intersect) inside = !inside;
                    }
                    start = end;
                }
                return inside;
            }

            // Paint bucket. Recolours text, closed shapes and earlier fills; a click
            // on a line recolours the line; anywhere else fills the area that the
            // visible artwork encloses, like a paint app.
            fillAt(pos) {
                const found = this.hitTest(pos);
                const stroke = found?.stroke;
                const commit = () => {
                    this.renderCanvas();
                    this.updateEditedThumbnails();
                    this.saveStorage();
                };
                if (stroke && stroke.type !== 'group' && (stroke.type === 'text' || stroke.type === 'fill' || stroke.type === 'rect' || stroke.type === 'circle' || stroke.fillColor)) {
                    this.saveState();
                    if (stroke.motionTrackId) this.bakeMotionTracksByIds([stroke.motionTrackId]);
                    stroke.fillColor = this.brushColor;
                    if (stroke.type === 'text' || stroke.type === 'fill') stroke.color = this.brushColor;
                    commit();
                    return;
                }

                const region = this.findFillRegion(pos);
                if (!region) return;
                if (region.onLine) {
                    if (!stroke || stroke.type === 'group') {
                        this.showExportNotice('Click inside an area to fill it', true);
                        return;
                    }
                    this.saveState();
                    if (stroke.motionTrackId) this.bakeMotionTracksByIds([stroke.motionTrackId]);
                    stroke.color = this.brushColor;
                    commit();
                    return;
                }

                const outlines = this.traceRegionOutlines(region.mask, this.canvasWidth, this.canvasHeight);
                if (!outlines.length) return;
                const points = [];
                outlines.forEach((outline) => outline.forEach((point, index) => {
                    points.push(index === 0 ? { x: point.x, y: point.y, p: 0.5, m: 1 } : { x: point.x, y: point.y, p: 0.5 });
                }));
                this.saveState();
                // Fills sit at the bottom of the active layer, beneath its lines.
                this.getActiveStrokeList().unshift({
                    type: 'fill',
                    brushType: 'brush',
                    color: this.brushColor,
                    fillColor: this.brushColor,
                    size: 0,
                    opacity: this.opacity,
                    points,
                    holes: [],
                    sx: 1, sy: 1,
                    angle: 0
                });
                commit();
            }

            // Pixel mask of the area to fill: flood from the click across everything
            // not covered by visible artwork on either layer, bridging gaps of a few
            // pixels, then grown slightly so the fill tucks under its outlines.
            findFillRegion(pos) {
                const W = this.canvasWidth, H = this.canvasHeight;
                const sx = Math.floor(pos.x), sy = Math.floor(pos.y);
                if (sx < 0 || sy < 0 || sx >= W || sy >= H) return null;
                const frame = this.frames[this.frameIndex];
                const paper = this.backgroundHidden ? [] : this.getPaperStrokes(frame);
                const sampleArtwork = (layers, minAlpha = 32) => {
                    const canvas = document.createElement('canvas');
                    canvas.width = W; canvas.height = H;
                    const ctx = canvas.getContext('2d', { willReadFrequently: true });
                    layers.forEach(([list, layerName]) => list.forEach((item) => this.drawObject(ctx, item, false, layerName)));
                    const data = ctx.getImageData(0, 0, W, H).data;
                    const covered = new Uint8Array(W * H);
                    for (let i = 0; i < covered.length; i++) covered[i] = data[i * 4 + 3] > minAlpha ? 1 : 0;
                    return covered;
                };

                const artwork = sampleArtwork([[paper, 'paper'], [frame.strokes, 'ink']]);
                if (artwork[sy * W + sx]) return { onLine: true };
                const gap = 2;
                const walls = this.dilateMask(artwork, W, H, gap);
                let seed = sy * W + sx;
                if (walls[seed]) {
                    // Clicked in the thin band beside a line; start just beyond it.
                    seed = -1;
                    for (let r = 1; r <= gap + 1 && seed < 0; r++) {
                        for (let dy = -r; dy <= r && seed < 0; dy++) {
                            for (let dx = -r; dx <= r; dx++) {
                                const x = sx + dx, y = sy + dy;
                                if (x >= 0 && y >= 0 && x < W && y < H && !walls[y * W + x]) { seed = y * W + x; break; }
                            }
                        }
                    }
                    if (seed < 0) return { onLine: true };
                }

                const region = new Uint8Array(W * H);
                const stack = new Int32Array(W * H);
                let top = 0;
                stack[top++] = seed;
                region[seed] = 1;
                while (top) {
                    const i = stack[--top];
                    const x = i % W;
                    if (x > 0 && !region[i - 1] && !walls[i - 1]) { region[i - 1] = 1; stack[top++] = i - 1; }
                    if (x < W - 1 && !region[i + 1] && !walls[i + 1]) { region[i + 1] = 1; stack[top++] = i + 1; }
                    if (i >= W && !region[i - W] && !walls[i - W]) { region[i - W] = 1; stack[top++] = i - W; }
                    if (i < W * (H - 1) && !region[i + W] && !walls[i + W]) { region[i + W] = 1; stack[top++] = i + W; }
                }

                const mask = this.dilateMask(region, W, H, gap + 1);
                // On the Foreground layer the fill is drawn above Background lines,
                // so it must not grow into their solid core. It may cover their soft
                // antialiased edge, which would otherwise show as a pale rim.
                if (this.activeLayer === 'ink' && paper.length) {
                    const background = sampleArtwork([[paper, 'paper']], 160);
                    for (let i = 0; i < mask.length; i++) if (background[i] && !region[i]) mask[i] = 0;
                }
                return { mask };
            }

            dilateMask(mask, W, H, radius) {
                const rows = new Uint8Array(W * H);
                for (let y = 0; y < H; y++) {
                    const row = y * W;
                    for (let x = 0; x < W; x++) {
                        if (!mask[row + x]) continue;
                        const to = Math.min(W - 1, x + radius);
                        for (let k = Math.max(0, x - radius); k <= to; k++) rows[row + k] = 1;
                    }
                }
                const out = new Uint8Array(W * H);
                for (let y = 0; y < H; y++) {
                    for (let x = 0; x < W; x++) {
                        if (!rows[y * W + x]) continue;
                        const to = Math.min(H - 1, y + radius);
                        for (let k = Math.max(0, y - radius); k <= to; k++) out[k * W + x] = 1;
                    }
                }
                return out;
            }

            // Outlines of a pixel mask as closed polygons (outer edges and holes),
            // simplified from pixel steps to smooth edges.
            traceRegionOutlines(mask, W, H) {
                const stride = W + 1;
                const next = new Int32Array(stride * (H + 1)).fill(-1);
                const spare = new Int32Array(stride * (H + 1)).fill(-1);
                const add = (from, to) => { if (next[from] === -1) next[from] = to; else spare[from] = to; };
                for (let y = 0; y < H; y++) {
                    for (let x = 0; x < W; x++) {
                        const i = y * W + x;
                        if (!mask[i]) continue;
                        const v = y * stride + x;
                        if (y === 0 || !mask[i - W]) add(v, v + 1);
                        if (x === W - 1 || !mask[i + 1]) add(v + 1, v + 1 + stride);
                        if (y === H - 1 || !mask[i + W]) add(v + 1 + stride, v + stride);
                        if (x === 0 || !mask[i - 1]) add(v + stride, v);
                    }
                }
                const take = (v) => {
                    let to = next[v];
                    if (to !== -1) { next[v] = spare[v]; spare[v] = -1; return to; }
                    return -1;
                };
                const outlines = [];
                for (let start = 0; start < next.length; start++) {
                    while (next[start] !== -1) {
                        const loop = [];
                        let v = start;
                        do {
                            loop.push({ x: v % stride, y: Math.floor(v / stride) });
                            v = take(v);
                        } while (v !== start && v !== -1);
                        // Keep only corners, then smooth the pixel steps.
                        const corners = loop.filter((point, index) => {
                            const prev = loop[(index - 1 + loop.length) % loop.length];
                            const after = loop[(index + 1) % loop.length];
                            return (point.x - prev.x) * (after.y - point.y) !== (point.y - prev.y) * (after.x - point.x);
                        });
                        const outline = this.simplifyClosedPath(corners, 0.75);
                        let area = 0;
                        for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) area += (outline[j].x + outline[i].x) * (outline[j].y - outline[i].y);
                        if (outline.length >= 3 && Math.abs(area) / 2 >= 4) outlines.push(outline);
                    }
                }
                return outlines;
            }

            simplifyClosedPath(points, tolerance) {
                if (points.length <= 4) return points;
                let far = 0, farDistance = -1;
                points.forEach((point, index) => {
                    const distance = Math.hypot(point.x - points[0].x, point.y - points[0].y);
                    if (distance > farDistance) { farDistance = distance; far = index; }
                });
                const simplify = (run) => {
                    const keep = new Uint8Array(run.length);
                    keep[0] = keep[run.length - 1] = 1;
                    const ranges = [[0, run.length - 1]];
                    while (ranges.length) {
                        const [a, b] = ranges.pop();
                        let worst = -1, index = -1;
                        for (let i = a + 1; i < b; i++) {
                            const distance = this.distToSegment(run[i], run[a], run[b]);
                            if (distance > worst) { worst = distance; index = i; }
                        }
                        if (worst > tolerance) { keep[index] = 1; ranges.push([a, index], [index, b]); }
                    }
                    return run.filter((_, i) => keep[i]);
                };
                const first = simplify(points.slice(0, far + 1));
                const second = simplify([...points.slice(far), points[0]]);
                return [...first.slice(0, -1), ...second.slice(0, -1)];
            }

            hitTestHandles(pos) {
                const b = this.selectedObject.bounds;
                const s = 10;

                let p = { x: pos.x, y: pos.y };

                if (this.selectedObject.stroke && this.selectedObject.stroke.angle) {
                    const cx = b.x + b.w / 2;
                    const cy = b.y + b.h / 2;
                    const dx = pos.x - cx;
                    const dy = pos.y - cy;
                    const ang = -this.selectedObject.stroke.angle;
                    p.x = cx + dx * Math.cos(ang) - dy * Math.sin(ang);
                    p.y = cy + dx * Math.sin(ang) + dy * Math.cos(ang);
                } else if (this.selectedObject.isGroup && this.selectedObject.angle) {
                    const cx = b.x + b.w / 2;
                    const cy = b.y + b.h / 2;
                    const dx = pos.x - cx;
                    const dy = pos.y - cy;
                    const ang = -this.selectedObject.angle;
                    p.x = cx + dx * Math.cos(ang) - dy * Math.sin(ang);
                    p.y = cy + dx * Math.sin(ang) + dy * Math.cos(ang);
                }

                const hit = (x, y) => Math.abs(p.x - x) < s && Math.abs(p.y - y) < s;

                if (hit(b.x + b.w / 2, b.y - 25)) return 'rotate';
                if (hit(b.x, b.y)) return 'resize-tl';
                if (hit(b.x + b.w, b.y)) return 'resize-tr';
                if (hit(b.x, b.y + b.h)) return 'resize-bl';
                if (hit(b.x + b.w, b.y + b.h)) return 'resize-br';
                if (hit(b.x + b.w / 2, b.y)) return 'resize-t';
                if (hit(b.x + b.w / 2, b.y + b.h)) return 'resize-b';
                if (hit(b.x, b.y + b.h / 2)) return 'resize-l';
                if (hit(b.x + b.w, b.y + b.h / 2)) return 'resize-r';

                return null;
            }

            distToSegment(p, v, w) {
                const l2 = (v.x - w.x) ** 2 + (v.y - w.y) ** 2;
                if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);
                let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
                t = Math.max(0, Math.min(1, t));
                return Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y)));
            }

            calcBounds(stroke) { this.selectedObject.bounds = this.getStrokeBounds(stroke); }

            getResizeBounds(bounds, dragMode, pos) {
                const minSize = 5;
                const dx = pos.x - this.dragStart.x;
                const dy = pos.y - this.dragStart.y;
                const dir = dragMode.split('-')[1] || '';
                const isCorner = (dir.includes('l') || dir.includes('r')) && (dir.includes('t') || dir.includes('b'));

                let newW = bounds.w;
                let newH = bounds.h;
                let newX = bounds.x;
                let newY = bounds.y;

                if (dir.includes('r')) newW += dx;
                if (dir.includes('l')) { newX += dx; newW -= dx; }
                if (dir.includes('b')) newH += dy;
                if (dir.includes('t')) { newY += dy; newH -= dy; }

                newW = Math.max(minSize, newW);
                newH = Math.max(minSize, newH);

                if (isCorner && bounds.w > 0 && bounds.h > 0) {
                    const horizontalScale = newW / bounds.w;
                    const verticalScale = newH / bounds.h;
                    const scale = Math.abs(horizontalScale - 1) >= Math.abs(verticalScale - 1)
                        ? horizontalScale
                        : verticalScale;

                    newW = Math.max(minSize, bounds.w * scale);
                    newH = Math.max(minSize, bounds.h * scale);
                    newX = dir.includes('l') ? bounds.x + bounds.w - newW : bounds.x;
                    newY = dir.includes('t') ? bounds.y + bounds.h - newH : bounds.y;
                }

                return { x: newX, y: newY, w: newW, h: newH };
            }

            getSinglePointDiameter(stroke) {
                const type = stroke.brushType || 'brush';
                if (type === 'pencil') return 2;
                if (type === 'highlighter') return stroke.size * 2;
                if (type === 'marker') return stroke.size;
                return stroke.size;
            }

            getStrokeBounds(stroke) {
                // Handle persistent group
                if (stroke.type === 'group') {
                    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                    stroke.items.forEach(item => {
                        const b = this.getStrokeBounds(item);
                        if (b.x < minX) minX = b.x;
                        if (b.y < minY) minY = b.y;
                        if (b.x + b.w > maxX) maxX = b.x + b.w;
                        if (b.y + b.h > maxY) maxY = b.y + b.h;
                    });
                    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
                }
                if (stroke.type === 'text') {
                    const w = stroke.width * stroke.sx;
                    const h = stroke.height * stroke.sy;
                    return { x: stroke.x - 5, y: stroke.y - h - 5, w: w + 10, h: h + 15 };
                } else if (stroke.points.length === 1) {
                    const s = this.getSinglePointDiameter(stroke);
                    const { x: sx, y: sy } = this.getBrushScale(stroke);
                    const p = stroke.points[0];
                    const w = s * sx;
                    const h = s * sy;
                    return { x: p.x - w / 2, y: p.y - h / 2, w: w, h: h };
                } else {
                    if (stroke.points.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
                    const pointBounds = this.getPointBounds(stroke.points);
                    const scale = this.scalesLineWidth(stroke) ? this.getBrushScale(stroke) : { x: 1, y: 1 };
                    const padX = (stroke.size || 0) * scale.x / 2;
                    const padY = (stroke.size || 0) * scale.y / 2;
                    return {
                        x: pointBounds.x - padX,
                        y: pointBounds.y - padY,
                        w: pointBounds.w + padX * 2,
                        h: pointBounds.h + padY * 2
                    };
                }
            }

            getGroupBounds(items) {
                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                items.forEach(item => {
                    const b = this.getStrokeBounds(item.stroke);
                    if (b.x < minX) minX = b.x;
                    if (b.y < minY) minY = b.y;
                    if (b.x + b.w > maxX) maxX = b.x + b.w;
                    if (b.y + b.h > maxY) maxY = b.y + b.h;
                });
                return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
            }

            // Motion path on the canvas: a dot for every frame, and keys in the
            // timeline's yellow that can be dragged to change the path.
            getPathScale() {
                const width = this.canvas.getBoundingClientRect().width;
                return width ? this.canvasWidth / width : 1;
            }

            getPathTrack() {
                if (this.tool !== 'truck' || this.isPlaying || this.activeLayer !== 'ink') return null;
                return this.getMotionTrack(this.truckSelectedTrackId) || this.getMotionTrackForSelection();
            }

            getPathPoint(track, frame) {
                const bounds = this.getStrokeBounds(track.baseObject);
                const offset = this.getMotionOffset(track, frame);
                return { x: bounds.x + bounds.w / 2 + offset.dx, y: bounds.y + bounds.h / 2 + offset.dy };
            }

            // The key or frame dot under the pointer. The artwork on this frame
            // wins, so it can always be dragged even when a dot sits under it.
            hitMotionPath(pos) {
                const track = this.getPathTrack();
                if (!track) return null;
                if (this.selectedObject?.bounds && this.isInBounds(pos, this.selectedObject.bounds)) return null;
                // Fingers need a bigger target than a mouse.
                const reach = (window.matchMedia?.('(pointer: coarse)').matches ? 22 : 14) * this.getPathScale();
                const excluded = new Set(track.excludedFrames || []);
                let best = null;
                for (let frame = track.startFrame; frame <= track.endFrame; frame++) {
                    if (frame === this.frameIndex) continue;
                    const isKey = track.keyframes.some((key) => key.frame === frame);
                    if (!isKey && excluded.has(frame)) continue;
                    const point = this.getPathPoint(track, frame);
                    const distance = Math.hypot(point.x - pos.x, point.y - pos.y);
                    if (distance <= reach && (!best || distance < best.distance)) best = { track, frame, isKey, distance };
                }
                return best;
            }

            updatePathHover(pos) {
                const hit = this.hitMotionPath(pos);
                this.canvas.style.cursor = hit ? (hit.isKey ? 'grab' : 'pointer') : '';
                if ((hit?.frame ?? null) === (this.pathHover?.frame ?? null)) return;
                this.pathHover = hit ? { frame: hit.frame, isKey: hit.isKey } : null;
                this.renderCanvas();
            }

            dragPathKey(pos) {
                const drag = this.pathKeyDrag;
                const dx = pos.x - drag.start.x;
                const dy = pos.y - drag.start.y;
                if (!drag.moved) {
                    if (Math.hypot(dx, dy) < 3 * this.getPathScale()) return;
                    this.saveState();
                    drag.moved = true;
                }
                this.setMotionTrackKeyframe(drag.track, drag.frame, { dx: drag.offset.dx + dx, dy: drag.offset.dy + dy });
                this.renderCanvas();
            }

            // A drag moves the key; a click on it goes to its frame.
            finishPathKeyDrag() {
                const drag = this.pathKeyDrag;
                this.pathKeyDrag = null;
                this.canvas.style.cursor = '';
                if (!drag.moved) {
                    this.selectFrame(drag.frame);
                    return;
                }
                this.renderMotionTracks();
                this.renderCanvas();
                this.updateThumbnails();
                this.saveStorage();
            }

            drawMotionGuide(ctx) {
                const track = this.getPathTrack();
                this.updateMotionKeyBar(track);
                if (!track) return;
                const k = this.getPathScale();
                const blue = '#3478F6';
                const start = Number(track.startFrame);
                const end = Number(track.endFrame);
                const keys = [...track.keyframes].sort((a, b) => a.frame - b.frame);
                const isKey = (frame) => keys.some((key) => key.frame === frame);
                const hover = this.pathKeyDrag?.moved ? this.pathKeyDrag.frame : this.pathHover?.frame;
                ctx.save();
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                if (end > start) {
                    const steps = (end - start) * 8;
                    const points = [];
                    for (let step = 0; step <= steps; step++) points.push(this.getPathPoint(track, start + (end - start) * step / steps));
                    const trace = () => {
                        ctx.beginPath();
                        points.forEach((point, index) => (index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y)));
                    };
                    // A pale edge keeps the line readable over any drawing.
                    trace();
                    ctx.lineWidth = 6 * k;
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
                    ctx.stroke();
                    trace();
                    ctx.lineWidth = 3 * k;
                    ctx.strokeStyle = blue;
                    ctx.stroke();
                }
                // One dot per frame: close together is slow, far apart is fast.
                const excluded = new Set(track.excludedFrames || []);
                for (let frame = start; frame <= end; frame++) {
                    if (frame === this.frameIndex || excluded.has(frame) || isKey(frame)) continue;
                    const point = this.getPathPoint(track, frame);
                    ctx.beginPath();
                    ctx.arc(point.x, point.y, (frame === hover ? 6.5 : 5) * k, 0, Math.PI * 2);
                    ctx.fillStyle = '#fff';
                    ctx.fill();
                    ctx.lineWidth = 2.5 * k;
                    ctx.strokeStyle = blue;
                    ctx.stroke();
                    if (frame === hover) this.drawPathLabel(ctx, `Frame ${frame + 1}`, point, k);
                }
                // Hovering or dragging a key shows a ghost of the artwork there.
                if (hover != null && isKey(hover)) {
                    const ghost = this.cloneData(track.baseObject);
                    const offset = this.getMotionOffset(track, hover);
                    this.translateStrokeObject(ghost, offset.dx, offset.dy);
                    ctx.globalAlpha = 0.35;
                    this.drawObject(ctx, ghost, false, 'ink');
                    ctx.globalAlpha = 1;
                }
                keys.forEach((key, index) => {
                    const point = this.getPathPoint(track, key.frame);
                    const curved = index > 0 && (key.interpolation || track.interpolation) === 'curved';
                    const here = key.frame === this.frameIndex;
                    this.drawPathKey(ctx, point, curved, (here || key.frame === hover ? 10 : 8) * k, k);
                    if (!here) this.drawPathLabel(ctx, key.frame === hover ? `Frame ${key.frame + 1} · drag to move` : String(key.frame + 1), point, k);
                });
                ctx.restore();
            }

            // Keys match the timeline: a diamond for straight, a circle for curved.
            drawPathKey(ctx, point, curved, size, k) {
                ctx.save();
                ctx.translate(point.x, point.y);
                ctx.beginPath();
                if (curved) {
                    ctx.arc(0, 0, size * 0.85, 0, Math.PI * 2);
                } else {
                    ctx.rotate(Math.PI / 4);
                    ctx.rect(-size * 0.7, -size * 0.7, size * 1.4, size * 1.4);
                }
                ctx.fillStyle = '#ffcc00';
                ctx.fill();
                ctx.lineWidth = 2 * k;
                ctx.strokeStyle = '#1d1b20';
                ctx.stroke();
                ctx.restore();
            }

            drawPathLabel(ctx, text, point, k) {
                ctx.save();
                ctx.font = `600 ${11 * k}px Inter, 'Segoe UI', system-ui, sans-serif`;
                const width = ctx.measureText(text).width + 10 * k;
                const height = 17 * k;
                let x = point.x + 13 * k;
                if (x + width > this.canvasWidth) x = point.x - 13 * k - width;
                const y = Math.max(height / 2, point.y - 13 * k);
                ctx.beginPath();
                if (ctx.roundRect) ctx.roundRect(x, y - height / 2, width, height, 6 * k);
                else ctx.rect(x, y - height / 2, width, height);
                ctx.fillStyle = 'rgba(29, 27, 32, 0.86)';
                ctx.fill();
                ctx.fillStyle = '#fff';
                ctx.textBaseline = 'middle';
                ctx.fillText(text, x + 5 * k, y + 0.5 * k);
                ctx.restore();
            }

            // Motion moves artwork but can't resize it, so a dashed ring marks
            // the selection instead of handles.
            drawMotionRing(ctx) {
                const b = this.selectedObject.bounds;
                if (!b) return;
                const k = this.getPathScale();
                const pad = 7 * k;
                const angle = this.selectedObject.isGroup ? this.selectedObject.angle : this.selectedObject.stroke?.angle;
                ctx.save();
                if (angle) {
                    const cx = b.x + b.w / 2;
                    const cy = b.y + b.h / 2;
                    ctx.translate(cx, cy);
                    ctx.rotate(angle);
                    ctx.translate(-cx, -cy);
                }
                ctx.beginPath();
                if (ctx.roundRect) ctx.roundRect(b.x - pad, b.y - pad, b.w + pad * 2, b.h + pad * 2, Math.min(b.w, b.h) / 2 + pad);
                else ctx.rect(b.x - pad, b.y - pad, b.w + pad * 2, b.h + pad * 2);
                ctx.setLineDash([6 * k, 5 * k]);
                ctx.lineWidth = 2 * k;
                ctx.strokeStyle = '#3478F6';
                ctx.stroke();
                ctx.restore();
            }

            // On a key's frame, a small bar under the artwork can remove the key.
            updateMotionKeyBar(track) {
                const bar = document.getElementById('motion-key-bar');
                if (!bar) return;
                const keys = [...(track?.keyframes || [])].sort((a, b) => a.frame - b.frame);
                const keyIndex = keys.findIndex((key) => key.frame === this.frameIndex);
                const show = keyIndex > -1 && !this.pathKeyDrag && this.dragMode !== 'motion-move' && Boolean(this.selectedObject);
                bar.hidden = !show;
                if (!show) return;
                const key = keys[keyIndex];
                const curved = keyIndex > 0 && (key.interpolation || track.interpolation) === 'curved';
                bar.querySelector('.motion-key-icon')?.classList.toggle('curved', curved);
                const label = document.getElementById('motion-key-bar-label');
                if (label) label.textContent = `Key on frame ${key.frame + 1}`;
                const k = this.getPathScale();
                const point = this.getPathPoint(track, this.frameIndex);
                const half = this.getStrokeBounds(track.baseObject).h / 2;
                const below = point.y + half + 16 * k;
                const above = below + 44 * k > this.canvasHeight;
                bar.classList.toggle('above', above);
                bar.style.left = `${point.x / this.canvasWidth * 100}%`;
                bar.style.top = `${(above ? point.y - half - 16 * k : below) / this.canvasHeight * 100}%`;
            }

            showMotionHint() {
                const hint = document.getElementById('motion-hint');
                if (!hint) return;
                clearTimeout(this.motionHintTimer);
                hint.hidden = false;
                this.motionHintTimer = setTimeout(() => { hint.hidden = true; }, 6000);
            }

            hideMotionHint() {
                clearTimeout(this.motionHintTimer);
                const hint = document.getElementById('motion-hint');
                if (hint) hint.hidden = true;
            }

            rectIntersect(r1, r2) {
                return !(r2.x > r1.x + r1.w || r2.x + r2.w < r1.x || r2.y > r1.y + r1.h || r2.y + r2.h < r1.y);
            }

            isInBounds(pos, rect) {
                if (this.selectedObject) {
                    let angle = 0;
                    if (this.selectedObject.isGroup) angle = this.selectedObject.angle;
                    else if (this.selectedObject.stroke) angle = this.selectedObject.stroke.angle;

                    if (angle) {
                        const cx = rect.x + rect.w / 2;
                        const cy = rect.y + rect.h / 2;
                        const dx = pos.x - cx;
                        const dy = pos.y - cy;
                        const ang = -angle;
                        const rx = cx + dx * Math.cos(ang) - dy * Math.sin(ang);
                        const ry = cy + dx * Math.sin(ang) + dy * Math.cos(ang);
                        return rx >= rect.x && rx <= rect.x + rect.w && ry >= rect.y && ry <= rect.y + rect.h;
                    }
                }
                return pos.x >= rect.x && pos.x <= rect.x + rect.w && pos.y >= rect.y && pos.y <= rect.y + rect.h;
            }

            renderCanvas() {
                const ctx = this.ctx;
                const bgCtx = this.bgCtx;

                bgCtx.globalCompositeOperation = 'source-over';
                bgCtx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);

                // FIX 1: Use per-frame background colour if set, falling back to global selectedBgColor
                const bgColor = this.frames[this.frameIndex].frameBgColor || this.selectedBgColor;
                this.updateBgColorButton(bgColor);
                this.currentRenderBgColor = bgColor;
                bgCtx.fillStyle = bgColor;
                bgCtx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
                if (!this.backgroundHidden) this.drawBackgroundImage(bgCtx);
                if (this.referenceImage?.complete) { bgCtx.save(); bgCtx.globalAlpha = 0.35; const scale = Math.min(this.canvasWidth / this.referenceImage.width, this.canvasHeight / this.referenceImage.height); const width = this.referenceImage.width * scale, height = this.referenceImage.height * scale; bgCtx.drawImage(this.referenceImage, (this.canvasWidth - width) / 2, (this.canvasHeight - height) / 2, width, height); bgCtx.restore(); }
                bgCtx.globalAlpha = 1.0;
                if (!this.backgroundHidden) this.getPaperStrokes().forEach(s => this.drawObject(bgCtx, s, false, 'paper'));
                this.currentRenderBgColor = null;

                ctx.globalCompositeOperation = 'source-over';
                ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
                ctx.globalAlpha = 1.0;
                this.frames[this.frameIndex].strokes.forEach(s => this.drawObject(ctx, s, false, 'ink'));
                const previewTrack = this.tool === 'truck' && !this.isPlaying && this.activeLayer === 'ink' && this.truckSelectedTrackId
                    ? this.getMotionTrack(this.truckSelectedTrackId)
                    : null;
                const previewStroke = this.getMotionPreviewStroke(previewTrack);
                if (previewStroke) this.drawObject(ctx, previewStroke, false, 'ink');

                if (this.isOnion && !this.isPlaying) {
                    // Farthest frames first so the nearest ones sit on top; each step
                    // away is fainter. Earlier frames are tinted blue, later ones green.
                    const ghosts = [];
                    for (let offset = this.onionFrames; offset >= 1; offset--) ghosts.push([-offset, ONION_BEFORE_TINT]);
                    for (let offset = this.onionAfter; offset >= 1; offset--) ghosts.push([offset, ONION_AFTER_TINT]);
                    ghosts.forEach(([delta, tint]) => {
                        const frame = this.frames[this.frameIndex + delta];
                        if (!frame) return;
                        const alpha = this.onionOpacity * (1 - ((Math.abs(delta) - 1) * 0.25));
                        this.drawOnionFrame(ctx, frame, alpha, this.onionTint ? tint : null);
                    });
                    ctx.globalAlpha = 1.0;
                }

                this.drawMotionGuide(ctx);

                if (this.selectedObject && !this.isPlaying) {
                    const list = this.getActiveStrokeList();

                    if (this.selectedObject.isGroup) {
                        this.drawSelectionUI(ctx);
                    } else if (list.includes(this.selectedObject.stroke) || this.selectedObject.isMotionPreview) {
                        this.drawSelectionUI(ctx);
                    } else {
                        this.selectedObject = null;
                    }
                }

                this.updateSelectionMarquee();

                // Update floating group toolbar
                this.updateGroupToolbar();
                this.updateInspector();
                this.updatePaperHint();
            }

            scheduleRender() {
                if (this.renderQueued) return;
                this.renderQueued = true;
                requestAnimationFrame(() => {
                    this.renderQueued = false;
                    this.renderCanvas();
                });
            }

            objectHasEraserHoles(obj) {
                if (!obj) return false;
                if (obj.type === 'group') return (obj.items || []).some(item => this.objectHasEraserHoles(item));
                return Array.isArray(obj.holes) && obj.holes.length > 0;
            }

            collectEraserHoles(obj, result = []) {
                if (!obj) return result;
                if (obj.type === 'group') {
                    (obj.items || []).forEach(item => this.collectEraserHoles(item, result));
                    return result;
                }
                (obj.holes || []).forEach(hole => result.push(hole));
                return result;
            }

            // Expects a destination-out context. A round-capped, round-joined stroke
            // along a sweep covers exactly the union of the eraser circle along its
            // path. Sweeps of one radius are cut in a single stroke and dots in a
            // single fill, since each separate destination-out draw is costly.
            // When box is given, parts of holes that cannot reach it are skipped;
            // a long eraser drag is stored on every stroke it touched.
            cutEraserHoles(ctx, holes, box = null) {
                const reaches = (minX, minY, maxX, maxY) => !box ||
                    (maxX >= box.x - 1 && minX <= box.x + box.w + 1 && maxY >= box.y - 1 && minY <= box.y + box.h + 1);
                ctx.fillStyle = 'rgba(0,0,0,1)';
                ctx.strokeStyle = 'rgba(0,0,0,1)';
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                const sweepsByRadius = new Map();
                const dots = [];
                holes.forEach(hole => {
                    if (this.isSweepHole(hole)) {
                        if (hole.path.length === 1) dots.push(hole);
                        else if (hole.path.length > 1) {
                            if (!sweepsByRadius.has(hole.r)) sweepsByRadius.set(hole.r, []);
                            sweepsByRadius.get(hole.r).push(hole);
                        }
                        return;
                    }
                    if (!hole || !hole.length) return;
                    if (box) {
                        const b = this.getPointBounds(hole);
                        if (!reaches(b.x, b.y, b.x + b.w, b.y + b.h)) return;
                    }
                    ctx.beginPath();
                    ctx.moveTo(hole[0].x, hole[0].y);
                    for (let i = 1; i < hole.length; i++) ctx.lineTo(hole[i].x, hole[i].y);
                    ctx.closePath();
                    ctx.fill();
                });

                sweepsByRadius.forEach((sweeps, r) => {
                    ctx.beginPath();
                    let any = false;
                    sweeps.forEach(({ path }) => {
                        let drawing = false;
                        for (let i = 1; i < path.length; i++) {
                            const a = path[i - 1], b = path[i];
                            if (!reaches(Math.min(a.x, b.x) - r, Math.min(a.y, b.y) - r, Math.max(a.x, b.x) + r, Math.max(a.y, b.y) + r)) {
                                drawing = false;
                                continue;
                            }
                            if (!drawing) ctx.moveTo(a.x, a.y);
                            ctx.lineTo(b.x, b.y);
                            drawing = true;
                            any = true;
                        }
                    });
                    if (!any) return;
                    ctx.lineWidth = r * 2;
                    ctx.stroke();
                });

                ctx.beginPath();
                let anyDot = false;
                dots.forEach(({ path: [point], r }) => {
                    if (!reaches(point.x - r, point.y - r, point.x + r, point.y + r)) return;
                    ctx.moveTo(point.x + r, point.y);
                    ctx.arc(point.x, point.y, r, 0, Math.PI * 2);
                    anyDot = true;
                });
                if (anyDot) ctx.fill();
            }

            // A pixel box that contains everything drawObject can paint for a plain
            // stroke, so the isolated hole pass only touches that area. Returns null
            // for objects that are not cheap to bound (text), which use the whole canvas.
            getStrokePaintBox(stroke) {
                if (stroke.type === 'text' || stroke.type === 'group' || !stroke.points?.length) return null;
                const brushScale = this.getBrushScale(stroke);
                const reach = (stroke.size || 1) * Math.max(1, Math.abs(stroke.sx || 1), Math.abs(stroke.sy || 1), Math.abs(brushScale.x), Math.abs(brushScale.y)) + 4;
                const pointSets = [stroke.points];
                if (stroke.symmetric && stroke.type === 'brush') pointSets.push(this.getMirroredStroke(stroke).points);
                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                pointSets.forEach(points => {
                    const b = this.getPointBounds(points);
                    const corners = [
                        { x: b.x - reach, y: b.y - reach }, { x: b.x + b.w + reach, y: b.y - reach },
                        { x: b.x + b.w + reach, y: b.y + b.h + reach }, { x: b.x - reach, y: b.y + b.h + reach }
                    ];
                    // drawObject rotates a stroke about the centre of its points.
                    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
                    const cos = Math.cos(stroke.angle || 0), sin = Math.sin(stroke.angle || 0);
                    corners.forEach(({ x, y }) => {
                        const rx = cx + (x - cx) * cos - (y - cy) * sin;
                        const ry = cy + (x - cx) * sin + (y - cy) * cos;
                        minX = Math.min(minX, rx); maxX = Math.max(maxX, rx);
                        minY = Math.min(minY, ry); maxY = Math.max(maxY, ry);
                    });
                });
                if (![minX, minY, maxX, maxY].every(Number.isFinite)) return null;
                const x = Math.max(0, Math.floor(minX)), y = Math.max(0, Math.floor(minY));
                const w = Math.min(this.canvasWidth, Math.ceil(maxX)) - x, h = Math.min(this.canvasHeight, Math.ceil(maxY)) - y;
                return { x, y, w: Math.max(0, w), h: Math.max(0, h) };
            }

            drawObjectWithEraserHoles(ctx, obj, simpleMode, layerName) {
                const box = this.getStrokePaintBox(obj) || { x: 0, y: 0, w: this.canvasWidth, h: this.canvasHeight };
                if (!box.w || !box.h) return;
                // The stroke is drawn into a scratch canvas that only reaches as far
                // as its box: erasing on a canvas-sized scratch made every cut process
                // the whole canvas, which took most of a second per redraw on heavily
                // erased frames. Drawing is not shifted, because Firefox and WebKit
                // antialias curves slightly differently after a translation.
                const isolatedCtx = this.getEraserScratch(box.x + box.w, box.y + box.h);
                isolatedCtx.save();
                isolatedCtx.setTransform(1, 0, 0, 1, 0, 0);
                isolatedCtx.globalCompositeOperation = 'source-over';
                isolatedCtx.globalAlpha = 1;
                isolatedCtx.clearRect(box.x, box.y, box.w, box.h);
                this.drawObject(isolatedCtx, obj, simpleMode, layerName, false);

                isolatedCtx.globalCompositeOperation = 'destination-out';
                isolatedCtx.globalAlpha = 1;
                this.cutEraserHoles(isolatedCtx, this.collectEraserHoles(obj), box);
                isolatedCtx.restore();

                ctx.save();
                const targetAlpha = ctx.globalAlpha;
                ctx.globalCompositeOperation = 'source-over';
                ctx.globalAlpha = targetAlpha;
                ctx.drawImage(isolatedCtx.canvas, box.x, box.y, box.w, box.h, box.x, box.y, box.w, box.h);
                ctx.restore();
            }

            getEraserScratch(width, height) {
                // Sizes are rounded up so a handful of canvases serve every stroke.
                const w = Math.ceil(width / 64) * 64;
                const h = Math.ceil(height / 64) * 64;
                if (!this.eraserScratch) this.eraserScratch = new Map();
                const key = `${w}x${h}`;
                let scratch = this.eraserScratch.get(key);
                if (!scratch) {
                    const canvas = document.createElement('canvas');
                    canvas.width = w;
                    canvas.height = h;
                    scratch = canvas.getContext('2d');
                    this.eraserScratch.set(key, scratch);
                }
                return scratch;
            }

            drawGroupWithEraserHoles(ctx, group, simpleMode, layerName) {
                if (!this.groupEraserCanvas) {
                    this.groupEraserCanvas = document.createElement('canvas');
                    this.groupEraserCtx = this.groupEraserCanvas.getContext('2d');
                }
                if (!this.groupEraserCanvas.width || this.groupEraserCanvas.width !== this.canvasWidth || this.groupEraserCanvas.height !== this.canvasHeight) {
                    this.groupEraserCanvas.width = this.canvasWidth;
                    this.groupEraserCanvas.height = this.canvasHeight;
                }
                if (!this.childEraserCanvas) {
                    this.childEraserCanvas = document.createElement('canvas');
                    this.childEraserCtx = this.childEraserCanvas.getContext('2d');
                }
                if (this.childEraserCanvas.width !== this.canvasWidth || this.childEraserCanvas.height !== this.canvasHeight) {
                    this.childEraserCanvas.width = this.canvasWidth;
                    this.childEraserCanvas.height = this.canvasHeight;
                }

                const groupCtx = this.groupEraserCtx;
                groupCtx.save();
                groupCtx.globalCompositeOperation = 'source-over';
                groupCtx.globalAlpha = 1;
                groupCtx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);

                const bounds = this.getStrokeBounds(group);
                const cx = bounds.x + bounds.w / 2;
                const cy = bounds.y + bounds.h / 2;
                (group.items || []).forEach(item => {
                    const childCtx = this.childEraserCtx;
                    childCtx.save();
                    childCtx.globalCompositeOperation = 'source-over';
                    childCtx.globalAlpha = 1;
                    childCtx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
                    if (group.angle) {
                        childCtx.translate(cx, cy);
                        childCtx.rotate(group.angle);
                        childCtx.translate(-cx, -cy);
                    }
                    this.drawObject(childCtx, item, simpleMode, layerName, false);
                    childCtx.restore();

                    if (this.objectHasEraserHoles(item)) {
                        childCtx.save();
                        childCtx.globalCompositeOperation = 'destination-out';
                        childCtx.globalAlpha = 1;
                        this.cutEraserHoles(childCtx, this.collectEraserHoles(item));
                        childCtx.restore();
                    }
                    groupCtx.drawImage(this.childEraserCanvas, 0, 0);
                });
                groupCtx.restore();

                ctx.save();
                const targetAlpha = ctx.globalAlpha;
                ctx.globalCompositeOperation = 'source-over';
                ctx.globalAlpha = targetAlpha;
                ctx.drawImage(this.groupEraserCanvas, 0, 0);
                ctx.restore();
            }

            drawObject(ctx, obj, simpleMode = false, layerName = 'ink', applyHoles = true) {
                if (applyHoles && obj.type === 'group' && this.objectHasEraserHoles(obj)) {
                    this.drawGroupWithEraserHoles(ctx, obj, simpleMode, layerName);
                    return;
                }
                if (applyHoles && obj.type !== 'group' && this.objectHasEraserHoles(obj)) {
                    this.drawObjectWithEraserHoles(ctx, obj, simpleMode, layerName);
                    return;
                }
                // Handle persistent group objects
                if (obj.type === 'group') {
                    ctx.save();
                    if (obj.angle) {
                        const b = this.getStrokeBounds(obj);
                        const cx = b.x + b.w / 2;
                        const cy = b.y + b.h / 2;
                        ctx.translate(cx, cy);
                        ctx.rotate(obj.angle);
                        ctx.translate(-cx, -cy);
                    }
                    obj.items.forEach(item => this.drawObject(ctx, item, simpleMode, layerName, applyHoles));
                    ctx.restore();
                    return;
                }
                if (obj.type === 'text') {
                    ctx.save();
                    const w = obj.width * (obj.sx || 1);
                    const h = obj.height * (obj.sy || 1);
                    const cx = obj.x + w / 2;
                    const cy = obj.y - h / 2;

                    ctx.translate(cx, cy);
                    if (obj.angle) ctx.rotate(obj.angle);
                    ctx.translate(-cx, -cy);

                    ctx.translate(obj.x, obj.y);
                    const sx = (isFinite(obj.sx) && obj.sx !== 0) ? obj.sx : 1;
                    const sy = (isFinite(obj.sy) && obj.sy !== 0) ? obj.sy : 1;
                    ctx.scale(sx, sy);
                    ctx.font = `${obj.bold ? 'bold ' : ''}${obj.size}px sans-serif`;
                    ctx.fillStyle = obj.color;
                    const currentAlpha = ctx.globalAlpha;
                    const objAlpha = obj.opacity !== undefined ? obj.opacity : 1;
                    ctx.globalAlpha = currentAlpha * objAlpha;
                    ctx.fillText(obj.text, 0, 0);
                    ctx.restore();
                } else {
                    if (obj.angle) {
                        ctx.save();
                        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
                        obj.points.forEach(p => { if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x; if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y; });
                        const cx = (minX + maxX) / 2;
                        const cy = (minY + maxY) / 2;
                        ctx.translate(cx, cy);
                        ctx.rotate(obj.angle);
                        ctx.translate(-cx, -cy);
                        this.drawStroke(ctx, obj, simpleMode, layerName);
                        ctx.restore();
                    } else {
                        ctx.save();
                        this.drawStroke(ctx, obj, simpleMode, layerName);
                        ctx.restore();
                    }

                    if (obj.symmetric && obj.type === 'brush') {
                        this.drawObject(ctx, this.getMirroredStroke(obj), simpleMode, layerName, applyHoles);
                    }
                }
            }

            getMirroredStroke(stroke) {
                return {
                    ...stroke,
                    symmetric: false,
                    points: stroke.points.map((point) => ({ ...point, x: this.canvasWidth - point.x }))
                };
            }

            drawSelectionUI(ctx) {
                if (this.tool === 'truck') {
                    this.drawMotionRing(ctx);
                    return;
                }
                const b = this.selectedObject.bounds;
                ctx.save();

                let angle = 0;
                if (this.selectedObject.isGroup) angle = this.selectedObject.angle;
                else if (this.selectedObject.stroke) angle = this.selectedObject.stroke.angle;

                if (angle) {
                    const cx = b.x + b.w / 2;
                    const cy = b.y + b.h / 2;
                    ctx.translate(cx, cy);
                    ctx.rotate(angle);
                    ctx.translate(-cx, -cy);
                }

                // Persistent groups get a teal accent; temporary selections get blue
                const accentColor = this.selectedObject.isPersistentGroup ? '#2ecc71' : '#0A84FF';
                ctx.strokeStyle = accentColor;
                ctx.lineWidth = 1;

                ctx.beginPath();
                ctx.moveTo(b.x + b.w / 2, b.y);
                ctx.lineTo(b.x + b.w / 2, b.y - 25);
                ctx.stroke();

                ctx.beginPath();
                ctx.arc(b.x + b.w / 2, b.y - 25, 5, 0, Math.PI * 2);
                ctx.fillStyle = '#fff';
                ctx.fill();
                ctx.stroke();

                // Persistent groups: solid border; temporary: dashed
                if (this.selectedObject.isPersistentGroup) {
                    ctx.setLineDash([4, 3]);
                } else {
                    ctx.setLineDash([5, 5]);
                }
                ctx.strokeRect(b.x, b.y, b.w, b.h);
                ctx.setLineDash([]);

                // Label for persistent group
                if (this.selectedObject.isPersistentGroup) {
                    ctx.fillStyle = accentColor;
                    ctx.font = '10px sans-serif';
                    ctx.fillText('GROUP', b.x + 3, b.y - 4);
                }

                const drawHandle = (x, y) => {
                    ctx.fillStyle = '#fff';
                    ctx.strokeStyle = accentColor;
                    ctx.fillRect(x - 4, y - 4, 8, 8);
                    ctx.strokeRect(x - 4, y - 4, 8, 8);
                };

                drawHandle(b.x, b.y);
                drawHandle(b.x + b.w, b.y);
                drawHandle(b.x, b.y + b.h);
                drawHandle(b.x + b.w, b.y + b.h);
                drawHandle(b.x + b.w / 2, b.y);
                drawHandle(b.x + b.w / 2, b.y + b.h);
                drawHandle(b.x, b.y + b.h / 2);
                drawHandle(b.x + b.w, b.y + b.h / 2);

                ctx.restore();
            }

            drawStroke(ctx, stroke, simpleMode = false, layerName = 'ink') {
                if (!stroke.points || stroke.points.length === 0) return;

                const isEraser = stroke.type === 'eraser';
                if (simpleMode && isEraser) return;
                const bgColor = this.currentRenderBgColor || this.frames[this.frameIndex].frameBgColor || this.selectedBgColor;
                const hex = isEraser && layerName !== 'ink' ? bgColor : stroke.color;
                const alpha = stroke.opacity !== undefined ? stroke.opacity : 1.0;
                const rgba = this.hexToRgba(hex, alpha);

                if (isEraser && layerName === 'ink') {
                    ctx.globalCompositeOperation = 'destination-out';
                }

                ctx.fillStyle = rgba;
                ctx.strokeStyle = rgba;

                if (stroke.type === 'fill') {
                    ctx.beginPath();
                    stroke.points.forEach((point, index) => {
                        if (index === 0 || point.m) {
                            if (index) ctx.closePath();
                            ctx.moveTo(point.x, point.y);
                        } else {
                            ctx.lineTo(point.x, point.y);
                        }
                    });
                    ctx.closePath();
                    ctx.fill('evenodd');
                    return;
                }

                const type = stroke.brushType || 'brush';

                if (simpleMode || ['brush', 'eraser', 'rect', 'circle', 'line'].includes(stroke.type) || ['pencil', 'marker', 'highlighter'].includes(type)) {
                    if (stroke.points.length === 1 && stroke.type !== 'rect' && stroke.type !== 'circle' && stroke.type !== 'line') {
                        const p = stroke.points[0];
                        let renderWidth = this.getSinglePointDiameter(stroke);

                        if (type === 'highlighter') {
                            if (!simpleMode) ctx.fillStyle = this.hexToRgba(hex, alpha * 0.4);
                        }

                        ctx.save();
                        ctx.translate(p.x, p.y);
                        if (stroke.angle) ctx.rotate(stroke.angle);
                        ctx.scale(stroke.sx || 1, stroke.sy || 1);
                        ctx.beginPath();
                        ctx.arc(0, 0, renderWidth / 2, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.restore();
                        return;
                    }

                    const brushScale = this.scalesLineWidth(stroke) ? this.getBrushScale(stroke) : { x: 1, y: 1 };
                    const useBrushScale = this.scalesLineWidth(stroke) && (brushScale.x !== 1 || brushScale.y !== 1);
                    const pointBounds = useBrushScale ? this.getPointBounds(stroke.points) : null;
                    const brushCenter = pointBounds
                        ? { x: pointBounds.x + pointBounds.w / 2, y: pointBounds.y + pointBounds.h / 2 }
                        : null;
                    if (useBrushScale) {
                        ctx.save();
                        ctx.translate(brushCenter.x, brushCenter.y);
                        ctx.scale(brushScale.x, brushScale.y);
                        ctx.translate(-brushCenter.x, -brushCenter.y);
                    }

                    const renderPoint = (point) => useBrushScale
                        ? {
                            x: brushCenter.x + (point.x - brushCenter.x) / brushScale.x,
                            y: brushCenter.y + (point.y - brushCenter.y) / brushScale.y
                        }
                        : point;
                    const firstPoint = renderPoint(stroke.points[0]);
                    ctx.beginPath();
                    let renderWidth = stroke.size;

                    if (type === 'pencil') {
                        ctx.lineWidth = 2;
                        if (!simpleMode) ctx.strokeStyle = this.hexToRgba(hex, alpha * 0.7);
                    } else if (type === 'marker') {
                        ctx.lineWidth = stroke.size;
                        ctx.lineCap = 'round';
                        ctx.lineJoin = 'round';
                    } else if (type === 'highlighter') {
                        ctx.lineWidth = stroke.size * 2;
                        ctx.lineCap = 'butt';
                        if (!simpleMode) ctx.strokeStyle = this.hexToRgba(hex, alpha * 0.4);
                    } else {
                        ctx.lineWidth = renderWidth;
                        ctx.lineCap = 'round';
                        ctx.lineJoin = 'round';
                    }

                    ctx.moveTo(firstPoint.x, firstPoint.y);
                    if (['brush', 'eraser'].includes(stroke.type) && stroke.points.length > 2) {
                        // Freehand strokes curve through the midpoints between
                        // points instead of joining them with straight lines.
                        for (let i = 1; i < stroke.points.length - 1; i++) {
                            const point = renderPoint(stroke.points[i]);
                            const next = renderPoint(stroke.points[i + 1]);
                            ctx.quadraticCurveTo(point.x, point.y, (point.x + next.x) / 2, (point.y + next.y) / 2);
                        }
                        const lastPoint = renderPoint(stroke.points[stroke.points.length - 1]);
                        ctx.lineTo(lastPoint.x, lastPoint.y);
                    } else {
                        for (let i = 1; i < stroke.points.length; i++) {
                            const point = renderPoint(stroke.points[i]);
                            ctx.lineTo(point.x, point.y);
                        }
                    }

                    // FIX 2: closePath before fill so rect/circle shapes render their fill correctly
                    if (stroke.fillColor) {
                        ctx.closePath();
                        ctx.fillStyle = this.hexToRgba(stroke.fillColor, alpha);
                        ctx.fill();
                        if (type === 'highlighter') ctx.fillStyle = this.hexToRgba(hex, alpha * 0.4);
                        else ctx.fillStyle = rgba;
                    }
                    ctx.stroke();
                    if (useBrushScale) ctx.restore();
                    return;
                }

                if (stroke.points.length < 2) {
                    const p = stroke.points[0];
                    const w = this.getSinglePointDiameter(stroke);
                    ctx.save();
                    ctx.translate(p.x, p.y);
                    if (stroke.angle) ctx.rotate(stroke.angle);
                    ctx.scale(stroke.sx || 1, stroke.sy || 1);
                    ctx.beginPath();
                    ctx.arc(0, 0, w / 2, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();
                    return;
                }

                // FIX 3: Draw filled polygon for freehand brush strokes when fillColor is set
                if (stroke.fillColor && stroke.points.length >= 3) {
                    ctx.save();
                    ctx.beginPath();
                    ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
                    for (let i = 1; i < stroke.points.length; i++) {
                        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
                    }
                    ctx.closePath();
                    ctx.fillStyle = this.hexToRgba(stroke.fillColor, alpha);
                    ctx.fill();
                    ctx.restore();
                }

                for (let i = 0; i < stroke.points.length - 1; i++) {
                    const p1 = stroke.points[i];
                    const p2 = stroke.points[i + 1];
                    const w1 = stroke.size * (p1.p !== undefined ? p1.p : 0.5);
                    const w2 = stroke.size * (p2.p !== undefined ? p2.p : 0.5);
                    const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
                    const steps = Math.ceil(dist / 2);

                    for (let j = 0; j <= steps; j++) {
                        const t = j / steps;
                        const x = p1.x + (p2.x - p1.x) * t;
                        const y = p1.y + (p2.y - p1.y) * t;
                        const w = w1 + (w2 - w1) * t;
                        ctx.beginPath();
                        ctx.arc(x, y, Math.max(1, w / 2), 0, Math.PI * 2);
                        ctx.fill();
                    }
                }
            }

            hexToRgba(hex, alpha) {
                let r = 0, g = 0, b = 0;
                if (hex && hex.length === 7) {
                    r = parseInt(hex.slice(1, 3), 16);
                    g = parseInt(hex.slice(3, 5), 16);
                    b = parseInt(hex.slice(5, 7), 16);
                }
                return `rgba(${r}, ${g}, ${b}, ${alpha})`;
            }

            getContrastTextColor(hex) {
                if (!hex || hex.length !== 7) return '#111111';
                const r = parseInt(hex.slice(1, 3), 16) / 255;
                const g = parseInt(hex.slice(3, 5), 16) / 255;
                const b = parseInt(hex.slice(5, 7), 16) / 255;
                const srgb = [r, g, b].map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
                const luminance = 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
                return luminance > 0.45 ? '#111111' : '#ffffff';
            }

            updateBgColorButton(color) {
                const swatch = document.getElementById('bg-color-swatch');
                const input = document.getElementById('bg-color-input');
                if (swatch) swatch.style.background = color;
                if (input) input.value = color;
            }

            setTool(t) {
                if (this.isHandTool) this.setHandTool(false);
                // Motion's keys and settings are in the panels, so it needs them.
                if (t === 'truck' && this.panelsHidden) this.setPanelsHidden(false);
                this.clearQuickLineTimer();
                this.quickLineActive = false;
                if (t === 'truck' && this.tool !== 'truck') this.showMotionHint();
                if (t !== 'truck') {
                    this.hideMotionHint();
                    this.pathHover = null;
                    this.canvas.style.cursor = '';
                }
                this.tool = t;
                document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
                const btn = document.getElementById('tool-' + t);
                if (btn) btn.classList.add('active');

                const shapeAnchor = document.getElementById('tool-shape-anchor');
                const shapeIcon = shapeAnchor.querySelector('.main-icon');

                if (['rect', 'circle', 'line'].includes(t)) {
                    shapeAnchor.classList.add('active');
                    if (t === 'rect') { shapeIcon.className = 'far fa-square main-icon'; shapeIcon.style.transform = ''; }
                    if (t === 'circle') { shapeIcon.className = 'far fa-circle main-icon'; shapeIcon.style.transform = ''; }
                    if (t === 'line') { shapeIcon.className = 'fas fa-slash main-icon'; shapeIcon.style.transform = 'rotate(-45deg)'; }
                } else {
                    shapeAnchor.classList.remove('active');
                }

                const brushAnchor = document.getElementById('tool-brush-anchor');
                if (brushAnchor) {
                    const brushIcon = brushAnchor.querySelector('.main-icon');
                    if (['brush', 'pencil', 'marker', 'highlighter'].includes(t)) {
                        brushAnchor.classList.add('active');
                        if (this.brushType === 'brush') brushIcon.className = 'fas fa-paint-brush main-icon';
                        if (this.brushType === 'pencil') brushIcon.className = 'fas fa-pencil-alt main-icon';
                        if (this.brushType === 'marker') brushIcon.className = 'fas fa-pen main-icon';
                        if (this.brushType === 'highlighter') brushIcon.className = 'fas fa-highlighter main-icon';
                    } else {
                        brushAnchor.classList.remove('active');
                    }
                }
                if (t !== 'truck') this.selectedObject = null;
                document.body.classList.toggle('truck-active', t === 'truck');
                if (t !== 'truck') {
                    this.setFlyoutExpanded('brush-wrapper', 'tool-brush-anchor', false);
                    this.setFlyoutExpanded('shape-wrapper', 'tool-shape-anchor', false);
                }
                if (t === 'truck' && this.selectedObject) {
                    const selectedTrack = this.getMotionTrackForSelection();
                    this.truckSelectedTrackId = selectedTrack?.id || null;
                } else if (t === 'truck') {
                    this.truckSelectedTrackId = null;
                }
                this.updateInspector();
                this.updateMotionPanel();
                this.renderMotionTracks();
                this.handleResize();
                this.renderCanvas();
                this.updateCursorStyle();
            }

            setHandTool(enabled) {
                this.isHandTool = enabled;
                const workspace = document.querySelector('.workspace');
                const handButton = document.getElementById('tool-hand');
                workspace?.classList.toggle('hand-tool', enabled);
                handButton?.classList.toggle('active', enabled);
                handButton?.setAttribute('aria-pressed', String(enabled));
                if (enabled) this.cursorEl.style.display = 'none';
            }

            toggleHandTool() {
                this.setHandTool(!this.isHandTool);
                this.updateInspector();
            }

            setBrushType(type) {
                this.brushType = type;
                this.setTool('brush');
                this.updateCursorStyle();
            }

            setLayer(l) {
                if (l === 'paper' && (this.backgroundLocked || this.backgroundHidden)) {
                    this.showExportNotice(this.backgroundLocked
                        ? 'The background is locked. Unlock it to draw on it.'
                        : 'The background is hidden. Show it to draw on it.');
                    return;
                }
                this.activeLayer = l;
                document.getElementById('layer-ink').classList.toggle('active', l === 'ink');
                document.getElementById('layer-paper').classList.toggle('active', l === 'paper');
                document.getElementById('layer-ink').setAttribute('aria-pressed', String(l === 'ink'));
                document.getElementById('layer-paper').setAttribute('aria-pressed', String(l === 'paper'));
                this.selectedObject = null;
                this.updateInspector();
                this.renderCanvas();
            }

            // Lock and Hide only change what can be edited and seen here; the
            // background is still saved, played and exported.
            toggleBackgroundLock() {
                this.backgroundLocked = !this.backgroundLocked;
                if (this.backgroundLocked && this.activeLayer === 'paper') this.setLayer('ink');
                this.syncBackgroundLayerUI();
            }

            toggleBackgroundHidden() {
                this.backgroundHidden = !this.backgroundHidden;
                if (this.backgroundHidden && this.activeLayer === 'paper') this.setLayer('ink');
                this.syncBackgroundLayerUI();
                this.renderCanvas();
            }

            syncBackgroundLayerUI() {
                const lock = document.getElementById('bg-lock');
                const hide = document.getElementById('bg-hide');
                const paper = document.getElementById('layer-paper');
                if (lock) {
                    lock.classList.toggle('active', this.backgroundLocked);
                    lock.setAttribute('aria-pressed', String(this.backgroundLocked));
                    lock.querySelector('span').textContent = this.backgroundLocked ? 'Locked' : 'Lock';
                }
                if (hide) {
                    hide.classList.toggle('active', this.backgroundHidden);
                    hide.setAttribute('aria-pressed', String(this.backgroundHidden));
                    hide.querySelector('span').textContent = this.backgroundHidden ? 'Hidden' : 'Hide';
                }
                paper?.classList.toggle('unavailable', this.backgroundLocked || this.backgroundHidden);
            }

            toggleSnapToGrid() {
                this.snapToGrid = !this.snapToGrid;
                const button = document.getElementById('snap-toggle');
                button?.classList.toggle('active', this.snapToGrid);
                button?.setAttribute('aria-pressed', String(this.snapToGrid));
            }

            toggleGrid() {
                this.showGrid = !this.showGrid;
                this.canvasWrapper.classList.toggle('show-grid', this.showGrid);
                this.canvasWrapper.style.setProperty('--grid-size', `${this.snapSize * this.zoom}px`);
                const button = document.getElementById('grid-toggle');
                button?.setAttribute('aria-pressed', String(this.showGrid));
                button?.classList.toggle('active', this.showGrid);
            }

            toggleSymmetry() {
                this.symmetryEnabled = !this.symmetryEnabled;
                const button = document.getElementById('symmetry-toggle');
                button?.setAttribute('aria-pressed', String(this.symmetryEnabled));
                button?.classList.toggle('active', this.symmetryEnabled);
            }

            setDrawingAidsOpen(open, returnFocus = false) {
                const menu = document.getElementById('drawing-aids-menu');
                const toggle = document.getElementById('drawing-aids-toggle');
                if (!menu || !toggle) return;
                menu.hidden = !open;
                toggle.setAttribute('aria-expanded', String(open));
                if (open && toggle.closest('.header-drawing-aids-wrapper')) {
                    this.positionHeaderMenu(menu, toggle, 214, 220);
                } else if (!open) {
                    menu.style.removeProperty('left');
                    menu.style.removeProperty('top');
                }
                if (returnFocus) toggle.focus();
            }

            // Header menus are fixed-position and placed under their button, since
            // the header row scrolls on narrow screens and would clip them.
            positionHeaderMenu(menu, toggle, fallbackWidth, fallbackHeight, align = 'right') {
                const rect = toggle.getBoundingClientRect();
                const viewportWidth = Math.max(1, window.innerWidth);
                const menuWidth = Math.min(menu.offsetWidth || fallbackWidth, Math.max(1, viewportWidth - 16));
                const menuHeight = Math.min(menu.offsetHeight || fallbackHeight, Math.max(1, window.innerHeight - 16));
                const left = Math.min(
                    Math.max(8, align === 'left' ? rect.left : rect.right - menuWidth),
                    Math.max(8, viewportWidth - menuWidth - 8)
                );
                const below = rect.bottom + 8;
                const top = below + menuHeight <= window.innerHeight - 8
                    ? below
                    : Math.max(8, rect.top - menuHeight - 8);
                menu.style.left = `${Math.round(left)}px`;
                menu.style.top = `${Math.round(top)}px`;
            }

            toggleDrawingAids() {
                const menu = document.getElementById('drawing-aids-menu');
                this.setDrawingAidsOpen(Boolean(menu?.hidden));
            }

            openReferenceImage() { document.getElementById('reference-file-input').click(); }
            loadReferenceImage(input) {
                const file = input.files?.[0]; if (!file) return;
                const reader = new FileReader();
                reader.onload = () => {
                    this.referenceImage = new Image();
                    this.referenceImage.onload = () => this.renderCanvas();
                    this.referenceImage.src = reader.result;
                    document.getElementById('reference-remove').style.display = '';
                };
                reader.readAsDataURL(file); input.value = '';
            }
            clearReferenceImage() { this.referenceImage = null; document.getElementById('reference-remove').style.display = 'none'; this.renderCanvas(); }

            getMoveDelta(pos) {
                let dx = pos.x - this.dragStart.x;
                let dy = pos.y - this.dragStart.y;
                if (this.snapToGrid) {
                    dx = Math.round(dx / this.snapSize) * this.snapSize;
                    dy = Math.round(dy / this.snapSize) * this.snapSize;
                }
                return { dx, dy };
            }

            // Heads the right panel with the active tool or selection; the hint is
            // its tooltip. Called on every render, so it only writes on change.
            updateInspector() {
                const title = document.getElementById('inspector-title');
                const panel = document.querySelector('.props-panel');
                if (!title || !panel) return;
                const show = (heading, hint, drawing) => {
                    if (title.textContent !== heading) title.textContent = heading;
                    if (title.title !== hint) title.title = hint;
                    const mode = drawing ? 'draw' : 'other';
                    if (panel.dataset.mode !== mode) panel.dataset.mode = mode;
                };
                if (this.tool === 'truck' && !this.isHandTool) {
                    if (panel.dataset.mode !== 'motion') panel.dataset.mode = 'motion';
                    return;
                }
                if (this.selectedObject) {
                    const names = { brush: 'Stroke', rect: 'Rectangle', circle: 'Circle', line: 'Line', text: 'Text', fill: 'Fill', group: 'Group' };
                    const heading = this.selectedObject.isPersistentGroup ? 'Group selected'
                        : this.selectedObject.isGroup ? `${this.selectedObject.items.length} objects selected`
                        : `${names[this.selectedObject.stroke?.type] || 'Object'} selected`;
                    show(heading, 'Colour, size and opacity changes apply to the selection. Use the handles on the canvas to move, resize or rotate it.', false);
                    return;
                }
                const labels = {
                    hand: ['Hand', 'Drag the canvas to pan. You can also hold Space or use the middle mouse button.'],
                    brush: ['Brush', 'Draw freehand marks on the active layer.'],
                    pencil: ['Pencil', 'Draw crisp freehand marks on the active layer.'],
                    marker: ['Marker', 'Draw soft, opaque strokes on the active layer.'],
                    highlighter: ['Highlighter', 'Draw translucent highlight strokes on the active layer.'],
                    rect: ['Rectangle', 'Drag on the canvas to create a rectangle.'],
                    circle: ['Circle', 'Drag on the canvas to create a circle.'],
                    line: ['Line', 'Drag on the canvas to create a line.'],
                    text: ['Text', 'Click the canvas to add editable text.'],
                    eraser: ['Eraser', 'Drag over marks to erase them.'],
                    bucket: ['Fill', 'Click the canvas to fill the active layer.'],
                    select: ['Select', 'Click an object to move, resize, rotate, or edit it.'],
                    truck: ['Motion', 'Click an object, then drag it on different frames to animate its movement.']
                };
                const key = this.isHandTool ? 'hand' : (this.tool === 'brush' ? (this.brushType || 'brush') : this.tool);
                const [toolTitle, toolDescription] = labels[key] || labels.brush;
                const drawing = !this.isHandTool && ['brush', 'eraser', 'rect', 'circle', 'line'].includes(this.tool);
                show(toolTitle, `${toolDescription} Active layer: ${this.activeLayer === 'ink' ? 'Foreground' : 'Background'}.`, drawing);
            }

            setColor(c) {
                this.brushColor = c;
                document.getElementById('html-color-picker').value = c;
                if (this.selectedObject) {
                    if (this.motionDirectEditBlocked()) return;
                    this.saveState();
                    if (this.selectedObject.isGroup) {
                        this.selectedObject.items.forEach(item => {
                            item.stroke.color = c;
                            if (item.stroke.fillColor) item.stroke.fillColor = c;
                        });
                    } else {
                        this.selectedObject.stroke.color = c;
                        if (this.selectedObject.stroke.fillColor) this.selectedObject.stroke.fillColor = c;
                    }
                    this.commitMotionArtworkEdits();
                    this.renderCanvas();
                    this.queueEditedThumbnails();
                    this.saveStorage();
                }
                this.updateCursorStyle();
            }

            updateBgColor(color) {
                this.clearFrameSelection();
                this.selectedBgColor = color;
                this.frames[this.frameIndex].frameBgColor = color;
                this.renderCanvas();
                this.updateThumbnails();
                this.saveStorage();
            }

            setColorMode(mode) { }

            setSize(s) {
                this.brushSize = parseInt(s);
                document.getElementById('size-disp').innerText = s;
                if (this.selectedObject) {
                    if (this.motionDirectEditBlocked()) return;
                    this.saveState();
                    if (this.selectedObject.isGroup) {
                        this.selectedObject.items.forEach(item => { item.stroke.size = this.brushSize; });
                        this.selectedObject.bounds = this.getGroupBounds(this.selectedObject.items);
                    } else {
                        this.selectedObject.stroke.size = this.brushSize;
                        this.calcBounds(this.selectedObject.stroke);
                    }
                    this.commitMotionArtworkEdits();
                    this.renderCanvas();
                    this.queueEditedThumbnails();
                    this.saveStorage();
                }
                this.updateCursorStyle();
            }

            setOpacity(v) {
                this.opacity = parseInt(v) / 100;
                document.getElementById('op-disp').innerText = v;
                if (this.selectedObject) {
                    if (this.motionDirectEditBlocked()) return;
                    this.saveState();
                    if (this.selectedObject.isGroup) {
                        this.selectedObject.items.forEach(item => { item.stroke.opacity = this.opacity; });
                    } else {
                        this.selectedObject.stroke.opacity = this.opacity;
                    }
                    this.commitMotionArtworkEdits();
                    this.renderCanvas();
                    this.queueEditedThumbnails();
                    this.saveStorage();
                }
                this.updateCursorStyle();
            }

            toggleOnion() {
                this.isOnion = !this.isOnion;
                document.getElementById('onion-btn').classList.toggle('active', this.isOnion);
                document.getElementById('onion-btn').setAttribute('aria-pressed', String(this.isOnion));
                this.syncOnionUI();
                // The settings sit at the bottom of the panel; bring them into view.
                if (this.isOnion) document.getElementById('onion-settings')?.scrollIntoView({ block: 'nearest' });
                this.renderCanvas();
            }

            drawOnionFrame(ctx, frame, alpha, tint) {
                if (!tint) {
                    ctx.globalAlpha = alpha;
                    frame.strokes.forEach(s => this.drawObject(ctx, s, true, 'ink'));
                    ctx.globalAlpha = 1.0;
                    return;
                }
                if (!this.onionCanvas) this.onionCanvas = document.createElement('canvas');
                const layer = this.onionCanvas;
                if (layer.width !== this.canvasWidth || layer.height !== this.canvasHeight) {
                    layer.width = this.canvasWidth;
                    layer.height = this.canvasHeight;
                }
                const layerCtx = layer.getContext('2d');
                layerCtx.save();
                layerCtx.globalCompositeOperation = 'source-over';
                layerCtx.globalAlpha = 1;
                layerCtx.clearRect(0, 0, layer.width, layer.height);
                frame.strokes.forEach(s => this.drawObject(layerCtx, s, true, 'ink'));
                // Keep the drawing's shape and soft edges, but in one colour.
                layerCtx.globalCompositeOperation = 'source-in';
                layerCtx.fillStyle = tint;
                layerCtx.fillRect(0, 0, layer.width, layer.height);
                layerCtx.restore();
                ctx.save();
                ctx.globalAlpha = alpha;
                ctx.drawImage(layer, 0, 0);
                ctx.restore();
            }

            setOnionAfter(value) {
                this.onionAfter = Math.max(0, Math.min(3, Number.parseInt(value, 10) || 0));
                this.syncOnionUI();
                this.renderCanvas();
            }

            setOnionTint(enabled) {
                this.onionTint = Boolean(enabled);
                this.syncOnionUI();
                this.renderCanvas();
            }

            setOnionFrames(value) {
                this.onionFrames = Math.max(1, Math.min(3, Number.parseInt(value, 10) || 1));
                this.syncOnionUI();
                this.renderCanvas();
            }

            setOnionOpacity(value) {
                this.onionOpacity = Math.max(0.05, Math.min(0.8, (Number.parseInt(value, 10) || 30) / 100));
                this.syncOnionUI();
                this.renderCanvas();
            }

            syncOnionUI() {
                const count = document.getElementById('onion-count');
                const after = document.getElementById('onion-after');
                const opacity = document.getElementById('onion-opacity');
                const tint = document.getElementById('onion-tint');
                const countDisplay = document.getElementById('onion-count-disp');
                const afterDisplay = document.getElementById('onion-after-disp');
                const opacityDisplay = document.getElementById('onion-opacity-disp');
                if (count) count.value = this.onionFrames;
                if (after) after.value = this.onionAfter;
                if (opacity) opacity.value = Math.round(this.onionOpacity * 100);
                if (tint) tint.checked = this.onionTint;
                if (countDisplay) countDisplay.textContent = this.onionFrames;
                if (afterDisplay) afterDisplay.textContent = this.onionAfter;
                if (opacityDisplay) opacityDisplay.textContent = `${Math.round(this.onionOpacity * 100)}%`;
                // The settings show while onion skin is on.
                const settings = document.getElementById('onion-settings');
                if (settings) settings.hidden = !this.isOnion;
            }

            rewind() {
                this.selectFrame(0);
            }

            getFrameHold(frame = this.frames[this.frameIndex]) {
                return Math.max(1, Math.min(12, Number.parseInt(frame?.hold, 10) || 1));
            }

            stepFrameHold(delta) {
                const next = this.getFrameHold({ hold: this.getFrameHold() + delta });
                if (next !== this.getFrameHold()) this.setFrameHold(next);
            }

            setFrameHold(value) {
                this.saveState();
                this.frames[this.frameIndex].hold = this.getFrameHold({ hold: value });
                this.syncTimelineSettings();
                this.renderUI(true);
                this.saveStorage();
            }

            toggleLoopMode() {
                this.loopMode = this.loopMode === 'loop' ? 'once' : 'loop';
                this.syncTimelineSettings();
            }

            selectFrame(index, { preserveFrameSelection = false } = {}) {
                const nextIndex = Math.max(0, Math.min(this.frames.length - 1, index));
                if (nextIndex === this.frameIndex) {
                    if (!preserveFrameSelection) this.clearFrameSelection(false);
                    this.syncFramePosition();
                    this.updateFrameSelectionUI();
                    return false;
                }
                if (!preserveFrameSelection) this.clearFrameSelection(false);
                this.frameIndex = nextIndex;
                this.selectedObject = null;
                if (this.tool === 'truck' && this.truckSelectedTrackId) this.selectMotionTrack(this.truckSelectedTrackId, false);
                this.renderCanvas();
                this.renderUI(true);
                return true;
            }

            previousFrame() {
                return this.selectFrame(this.frameIndex - 1);
            }

            // One tick on the scrub bar over the middle of each thumbnail.
            layoutFrameScrub() {
                const scrub = document.getElementById('frame-scrub');
                if (!scrub) return;
                scrub.querySelectorAll('.frame-scrub-tick').forEach(tick => tick.remove());
                this.framesList.querySelectorAll('.frame-card').forEach((card) => {
                    const tick = document.createElement('div');
                    tick.className = 'frame-scrub-tick';
                    tick.style.left = `${card.offsetLeft + card.offsetWidth / 2}px`;
                    scrub.appendChild(tick);
                });
                scrub.style.width = `${this.framesList.scrollWidth}px`;
            }

            syncFrameScrub() {
                const scrub = document.getElementById('frame-scrub');
                const card = this.framesList?.querySelectorAll('.frame-card')[this.frameIndex];
                if (!scrub || !card) return;
                // Thumbnails can change size as they load or the window narrows.
                const ticks = scrub.querySelectorAll('.frame-scrub-tick');
                const cards = this.framesList.querySelectorAll('.frame-card');
                const last = cards[cards.length - 1];
                if (ticks.length !== cards.length || ticks[ticks.length - 1].style.left !== `${last.offsetLeft + last.offsetWidth / 2}px`) this.layoutFrameScrub();
                const playhead = scrub.querySelector('.frame-playhead');
                playhead.style.left = `${card.offsetLeft + card.offsetWidth / 2}px`;
                playhead.textContent = this.frameIndex + 1;
                scrub.setAttribute('aria-valuemin', '1');
                scrub.setAttribute('aria-valuemax', String(this.frames.length));
                scrub.setAttribute('aria-valuenow', String(this.frameIndex + 1));
                scrub.setAttribute('aria-valuetext', `Frame ${this.frameIndex + 1} of ${this.frames.length}`);
            }

            startFrameScrub(event) {
                if (event.button !== 0) return;
                event.preventDefault();
                const scrub = event.currentTarget;
                if (this.isPlaying) this.togglePlay();
                scrub.setPointerCapture?.(event.pointerId);
                scrub.classList.add('scrubbing');
                this.frameScrub = { x: event.clientX, timer: null };
                this.scrubToX(event.clientX);
                const move = (e) => {
                    this.frameScrub.x = e.clientX;
                    this.scrubToX(e.clientX);
                };
                const end = () => {
                    clearInterval(this.frameScrub?.timer);
                    this.frameScrub = null;
                    scrub.classList.remove('scrubbing');
                    scrub.removeEventListener('pointermove', move);
                    scrub.removeEventListener('pointerup', end);
                    scrub.removeEventListener('pointercancel', end);
                };
                scrub.addEventListener('pointermove', move);
                scrub.addEventListener('pointerup', end);
                scrub.addEventListener('pointercancel', end);
                // Holding near either end keeps scrolling the strip, for long animations.
                this.frameScrub.timer = setInterval(() => {
                    if (!this.frameScrub) return;
                    const bounds = this.framesList.getBoundingClientRect();
                    const edge = 40;
                    const step = this.frameScrub.x < bounds.left + edge ? -24 : this.frameScrub.x > bounds.right - edge ? 24 : 0;
                    if (!step) return;
                    this.framesList.scrollLeft += step;
                    this.scrubToX(this.frameScrub.x);
                }, 30);
            }

            // Go to the frame whose thumbnail is nearest the pointer.
            scrubToX(clientX) {
                const bounds = this.framesList.getBoundingClientRect();
                const x = Math.max(bounds.left, Math.min(bounds.right, clientX)) - bounds.left + this.framesList.scrollLeft;
                let nearest = this.frameIndex;
                let distance = Infinity;
                this.framesList.querySelectorAll('.frame-card').forEach((card, index) => {
                    const gap = Math.abs(card.offsetLeft + card.offsetWidth / 2 - x);
                    if (gap < distance) {
                        distance = gap;
                        nearest = index;
                    }
                });
                this.selectFrame(nearest);
            }

            nextFrame() {
                return this.selectFrame(this.frameIndex + 1);
            }

            addFrame() {
                this.saveState();
                this.selectedObject = null;
                const insertAt = this.frameIndex + 1;
                this.frames.splice(insertAt, 0, { strokes: [], paperStrokes: [], hold: 1 });
                this.remapMotionTracksAfterInsert(insertAt);
                this.motionTracks.forEach((track) => this.applyMotionTrack(track));
                this.frameIndex++;
                this.renderUI();
                this.renderCanvas();
                this.saveStorage();
                this.guideEvent('frame');
                setTimeout(() => {
                    const addBtn = document.getElementById('timeline-add');
                    if (addBtn) addBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
                }, 50);
            }

            revealTimelineEnd() {
                const frames = this.framesList;
                if (!frames) return;
                const end = Math.max(0, frames.scrollWidth - frames.clientWidth);
                if (typeof frames.scrollTo === 'function') {
                    // Let the user see the strip move across to the new frame,
                    // while the scroll listener keeps the movement row in lockstep.
                    frames.scrollTo({ left: end, behavior: 'smooth' });
                } else {
                    frames.scrollLeft = end;
                }
            }

            pulseAddFrameButton() {
                const addButton = this.framesList?.querySelector('.add-frame-btn');
                if (!addButton) return;
                clearTimeout(this.frameAddPulseTimer);
                addButton.classList.remove('frame-added-pulse');
                // Force a reflow so consecutive duplications restart the pulse.
                void addButton.offsetWidth;
                addButton.classList.add('frame-added-pulse');
                this.frameAddPulseTimer = setTimeout(() => {
                    addButton.classList.remove('frame-added-pulse');
                    this.frameAddPulseTimer = null;
                }, 1000);
            }

            animateAddedFrame(index) {
                const card = this.framesList?.querySelectorAll('.frame-card')?.[index];
                if (!card) return;
                clearTimeout(this.frameAddedTimer);
                card.classList.remove('frame-added');
                // Force a reflow so repeated duplications restart the entrance cue.
                void card.offsetWidth;
                card.classList.add('frame-added');
                this.frameAddedTimer = setTimeout(() => {
                    card.classList.remove('frame-added');
                    this.frameAddedTimer = null;
                }, 760);
            }

            duplicateFrame(index) {
                const target = index !== undefined ? index : this.frameIndex;
                const sourceFrame = this.frames[target];
                if (!sourceFrame) return false;
                const insertAt = target + 1;
                const sourceTrackIds = [...new Set((sourceFrame.strokes || [])
                    .map((stroke) => stroke?.motionTrackId)
                    .filter(Boolean))];
                const selectedTrackId = this.tool === 'truck'
                    ? (this.getMotionTrackForSelection()?.id || this.truckSelectedTrackId)
                    : null;
                const frameScrollLeft = this.framesList?.scrollLeft || 0;
                const duplicateWasLastFrame = target === this.frames.length - 1;

                this.saveState();
                this.frames.splice(target + 1, 0, {
                    strokes: this.cloneData(sourceFrame.strokes),
                    paperStrokes: this.cloneData(this.getPaperStrokes(sourceFrame)),
                    frameBgColor: sourceFrame.frameBgColor,
                    hold: this.getFrameHold(sourceFrame)
                });
                this.remapMotionTracksAfterInsert(insertAt);

                // A duplicated frame must retain animated artwork. The generated
                // motion copy is rebuilt from its track, so when the duplicate is
                // made directly after a track's endpoint, extend that span first;
                // otherwise applyMotionTrack removes the clone and leaves the new
                // frame empty.
                sourceTrackIds.forEach((trackId) => {
                    const track = this.getMotionTrack(trackId);
                    if (!track || target < track.startFrame || target > track.endFrame) return;
                    if (track.endFrame < insertAt) track.endFrame = insertAt;
                });
                this.motionTracks.forEach((track) => this.applyMotionTrack(track));
                this.frameIndex = insertAt;

                // Keep Truck's selected movement row attached to the duplicated
                // object instead of leaving a stale selection from the source
                // frame (or making the movement timeline disappear).
                this.selectedObject = null;
                if (this.tool === 'truck' && selectedTrackId && this.getMotionTrack(selectedTrackId)) {
                    this.truckSelectedTrackId = selectedTrackId;
                    this.selectMotionTrack(selectedTrackId, false);
                } else if (this.tool !== 'truck') {
                    this.truckSelectedTrackId = null;
                }
                this.renderUI();
                if (this.framesList) {
                    // Duplicating the last frame creates the new end of the
                    // timeline. Reveal it together with the Add Frame button;
                    // duplicates elsewhere preserve the user's scroll position.
                    if (duplicateWasLastFrame) this.revealTimelineEnd();
                    else this.framesList.scrollLeft = frameScrollLeft;
                }
                this.animateAddedFrame(insertAt);
                if (duplicateWasLastFrame) this.pulseAddFrameButton();
                this.renderCanvas();
                this.saveStorage();
                return true;
            }

            duplicateSelectedFrames() {
                const selected = this.getSelectedFrameIndices();
                const indices = selected.length ? selected : [this.frameIndex];
                if (!indices.length) return false;
                if (indices.length === 1) {
                    this.duplicateFrame(indices[0]);
                    return true;
                }

                const selectedTrackId = this.tool === 'truck'
                    ? (this.getMotionTrackForSelection()?.id || this.truckSelectedTrackId)
                    : null;
                const frameScrollLeft = this.framesList?.scrollLeft || 0;
                const duplicateWasLastFrame = indices.includes(this.frames.length - 1);
                const sourceTrackTargets = [];

                this.saveState();
                this.selectedObject = null;
                const inserted = [];
                indices.forEach((sourceIndex, offset) => {
                    const target = sourceIndex + offset;
                    const sourceFrame = this.frames[target];
                    if (!sourceFrame) return;
                    const insertAt = target + 1;
                    sourceTrackTargets.push({
                        frame: insertAt,
                        trackIds: [...new Set((sourceFrame.strokes || [])
                            .map((stroke) => stroke?.motionTrackId)
                            .filter(Boolean))]
                    });
                    this.frames.splice(target + 1, 0, {
                        strokes: this.cloneData(sourceFrame.strokes),
                        paperStrokes: this.cloneData(this.getPaperStrokes(sourceFrame)),
                        frameBgColor: sourceFrame.frameBgColor,
                        hold: this.getFrameHold(sourceFrame)
                    });
                    this.remapMotionTracksAfterInsert(insertAt);
                    inserted.push(insertAt);
                });
                sourceTrackTargets.forEach(({ frame, trackIds }) => trackIds.forEach((trackId) => {
                    const track = this.getMotionTrack(trackId);
                    if (track && track.endFrame < frame) track.endFrame = frame;
                }));
                this.motionTracks.forEach((track) => this.applyMotionTrack(track));
                this.frameIndex = inserted[inserted.length - 1] ?? this.frameIndex;
                if (this.tool === 'truck' && selectedTrackId && this.getMotionTrack(selectedTrackId)) {
                    this.truckSelectedTrackId = selectedTrackId;
                    this.selectMotionTrack(selectedTrackId, false);
                } else if (this.tool !== 'truck') {
                    this.truckSelectedTrackId = null;
                }
                this.selectedFrameIndices = inserted;
                this.frameSelectionAnchor = inserted[0] ?? null;
                this.timelineSelectionFocused = true;
                this.renderUI();
                if (this.framesList) {
                    if (duplicateWasLastFrame) this.revealTimelineEnd();
                    else this.framesList.scrollLeft = frameScrollLeft;
                }
                this.animateAddedFrame(inserted[inserted.length - 1]);
                if (duplicateWasLastFrame) this.pulseAddFrameButton();
                this.renderCanvas();
                this.saveStorage();
                return true;
            }

            deleteFrame(index) {
                this.saveState();
                this.selectedObject = null;
                const targetIndex = (index !== undefined) ? index : this.frameIndex;
                if (this.frames.length <= 1) {
                    this.frames[0].strokes = [];
                    this.frames[0].paperStrokes = [];
                    this.motionTracks = [];
                    this.renderCanvas();
                } else {
                    this.frames.splice(targetIndex, 1);
                    this.remapMotionTracksAfterDelete(targetIndex);
                    if (this.frameIndex >= this.frames.length) {
                        this.frameIndex = this.frames.length - 1;
                    } else if (this.frameIndex > targetIndex) {
                        this.frameIndex--;
                    }
                }
                this.renderUI();
                this.renderCanvas();
                this.saveStorage();
            }

            deleteSelectedFrames() {
                const selected = this.getSelectedFrameIndices();
                const indices = selected.length ? selected : [this.frameIndex];
                if (!indices.length) return false;

                this.saveState();
                this.selectedObject = null;
                const activeIndex = this.frameIndex;
                const removedBeforeActive = indices.filter((index) => index < activeIndex).length;
                if (indices.length >= this.frames.length) {
                    // Keep the document's required single blank frame when the
                    // complete timeline is selected for deletion.
                    while (this.frames.length > 1) {
                        const target = this.frames.length - 1;
                        this.frames.splice(target, 1);
                        this.remapMotionTracksAfterDelete(target);
                    }
                    this.frames[0] = { strokes: [], paperStrokes: [], hold: 1 };
                    this.motionTracks = [];
                    this.frameIndex = 0;
                } else {
                    [...indices].sort((a, b) => b - a).forEach((target) => {
                        if (target < 0 || target >= this.frames.length) return;
                        this.frames.splice(target, 1);
                        this.remapMotionTracksAfterDelete(target);
                    });
                    this.frameIndex = Math.max(0, Math.min(this.frames.length - 1, activeIndex - removedBeforeActive));
                }
                this.clearFrameSelection(false);
                this.renderUI();
                this.renderCanvas();
                this.saveStorage();
                return true;
            }

            togglePlay() {
                if (this.isPlaying) {
                    this.isPlaying = false;
                    clearTimeout(this.playTimer);
                    document.querySelector('#play-btn i').className = 'fas fa-play';
                    document.getElementById('play-btn').style.background = 'var(--accent-blue)';
                    document.getElementById('play-btn').setAttribute('aria-label', 'Play animation');
                    document.getElementById('play-btn').setAttribute('aria-pressed', 'false');
                    this.renderCanvas();
                } else {
                    this.isPlaying = true;
                    this.guideEvent('play');
                    document.querySelector('#play-btn i').className = 'fas fa-stop';
                    document.getElementById('play-btn').style.background = '#ff3b30';
                    document.getElementById('play-btn').setAttribute('aria-label', 'Stop animation preview');
                    document.getElementById('play-btn').setAttribute('aria-pressed', 'true');
                    this.schedulePlayback();
                }
            }

            schedulePlayback() {
                clearTimeout(this.playTimer);
                const delay = (1000 / this.fps) * this.getFrameHold();
                this.playTimer = setTimeout(() => {
                    if (!this.isPlaying) return;
                    if (this.frameIndex === this.frames.length - 1 && this.loopMode === 'once') {
                        this.togglePlay();
                        return;
                    }
                    this.frameIndex = (this.frameIndex + 1) % this.frames.length;
                    this.renderCanvas();
                    this.updateTimelineActive();
                    this.schedulePlayback();
                }, delay);
            }

            getFpsControl() {
                return document.getElementById('fps-control') || document.querySelector('[oninput*="setFps"], [onchange*="setFps"]');
            }

            normalizeFps(value) {
                const control = this.getFpsControl();
                const min = control ? Number.parseInt(control.min, 10) : 1;
                const max = control ? Number.parseInt(control.max, 10) : 60;
                const safeMin = Number.isFinite(min) ? min : 1;
                const safeMax = Number.isFinite(max) && max >= safeMin ? max : 60;
                const parsed = Number.parseInt(value, 10);
                const fallback = Math.min(safeMax, Math.max(safeMin, 12));
                return Number.isFinite(parsed)
                    ? Math.min(safeMax, Math.max(safeMin, parsed))
                    : fallback;
            }

            syncFpsUI() {
                const fps = this.normalizeFps(this.fps);
                this.fps = fps;
                const control = this.getFpsControl();
                if (control) control.value = String(fps);
                const display = document.getElementById('fps-disp');
                if (display) display.innerText = `${fps} fps`;
            }

            setFps(val) {
                this.fps = this.normalizeFps(val);
                this.syncFpsUI();
                if (this.isPlaying) { this.togglePlay(); this.togglePlay(); }
                this.saveStorage();
            }

            updateMotionPanel() {
                const track = this.getMotionTrackForSelection();
                this.updateMotionSettings(track, [...(track?.keyframes || [])].sort((a, b) => a.frame - b.frame));
            }

            // The Motion settings panel: path shape, the keys, and Add or Remove
            // for this frame.
            updateMotionSettings(track, keys) {
                const settings = document.getElementById('motion-settings');
                if (!settings) return;
                // With artwork picked but not yet moving, Add key starts its motion.
                settings.classList.toggle('is-ready', Boolean(track || this.selectedObject));
                const keysLabel = document.getElementById('motion-keys-label');
                if (keysLabel) keysLabel.hidden = !keys.length;
                const curvedCount = keys.slice(1).filter((key) => (key.interpolation || track?.interpolation) === 'curved').length;
                const shape = keys.length < 2 ? null : curvedCount === keys.length - 1 ? 'curved' : curvedCount === 0 ? 'straight' : null;
                ['straight', 'curved'].forEach((value) => {
                    const button = document.getElementById(`motion-path-${value}`);
                    if (!button) return;
                    button.classList.toggle('active', shape === value);
                    button.setAttribute('aria-pressed', String(shape === value));
                    button.disabled = keys.length < 2;
                });
                const list = document.getElementById('motion-keys');
                if (list) {
                    list.replaceChildren(...keys.map((key, index) => {
                        const chip = document.createElement('button');
                        const icon = document.createElement('span');
                        const here = key.frame === this.frameIndex;
                        chip.type = 'button';
                        chip.className = `motion-key-chip${here ? ' active' : ''}`;
                        chip.setAttribute('aria-pressed', String(here));
                        chip.title = `Go to frame ${key.frame + 1}`;
                        icon.className = 'motion-key-icon';
                        icon.classList.toggle('curved', index > 0 && (key.interpolation || track.interpolation) === 'curved');
                        chip.append(icon, `Frame ${key.frame + 1}`);
                        chip.onclick = () => this.selectFrame(key.frame);
                        return chip;
                    }));
                }
                const action = document.getElementById('motion-key-action');
                if (action) {
                    const onKey = keys.some((key) => key.frame === this.frameIndex);
                    action.innerHTML = onKey
                        ? '<i class="fas fa-trash" aria-hidden="true"></i><span>Remove key on this frame</span>'
                        : '<i class="fas fa-plus" aria-hidden="true"></i><span>Add key on this frame</span>';
                    action.title = onKey ? 'Remove key on this frame' : 'Add key on this frame';
                    action.setAttribute('aria-label', action.title);
                    action.disabled = !this.selectedObject;
                }
            }

            retimeMotionKeyframe(track, fromFrame, toFrame) {
                if (!track || fromFrame === toFrame) return false;
                const source = track.keyframes.find((keyframe) => keyframe.frame === fromFrame);
                if (!source || track.keyframes.some((keyframe) => keyframe.frame === toFrame)) return false;
                this.saveState();
                track.keyframes = track.keyframes
                    .filter((keyframe) => keyframe.frame !== fromFrame)
                    .concat({ ...source, frame: toFrame })
                    .sort((a, b) => a.frame - b.frame);
                track.startFrame = track.keyframes[0].frame;
                track.endFrame = track.keyframes[track.keyframes.length - 1].frame;
                track.excludedFrames = (track.excludedFrames || []).filter((frame) => frame >= track.startFrame && frame <= track.endFrame);
                this.applyMotionTrack(track);
                this.selectMotionTrack(track.id, false);
                this.renderUI(true);
                this.renderCanvas();
                this.updateThumbnails();
                this.saveStorage();
                return true;
            }

            // Motion's keys show as badges on their frames' thumbnails. Dragging a
            // badge to another thumbnail changes when that key happens.
            renderMotionTracks() {
                const cards = [...(this.framesList?.querySelectorAll('.frame-card') || [])];
                cards.forEach((card) => card.querySelector('.frame-key-badge')?.remove());
                const track = this.tool === 'truck' ? (this.getMotionTrack(this.truckSelectedTrackId) || this.getMotionTrackForSelection()) : null;
                const keys = [...(track?.keyframes || [])].sort((a, b) => a.frame - b.frame);
                keys.forEach((key, index) => {
                    const card = cards[key.frame];
                    if (!card) return;
                    const badge = document.createElement('span');
                    badge.className = 'frame-key-badge';
                    badge.classList.toggle('curved', index > 0 && (key.interpolation || track.interpolation) === 'curved');
                    badge.dataset.frame = String(key.frame);
                    badge.title = `Key on frame ${key.frame + 1}. Drag it to another frame to change when it happens.`;
                    badge.draggable = false;
                    badge.innerHTML = '<i aria-hidden="true"></i>';
                    badge.onpointerdown = (event) => this.startKeyBadgeDrag(event, track, key.frame, badge);
                    badge.onclick = (event) => {
                        event.stopPropagation();
                        if (!this.suppressKeyBadgeClick) this.selectFrame(key.frame);
                    };
                    card.appendChild(badge);
                });
                this.updateMotionPanel();
            }

            startKeyBadgeDrag(event, track, fromFrame, badge) {
                if (event.button !== 0) return;
                event.preventDefault();
                event.stopPropagation();
                badge.setPointerCapture?.(event.pointerId);
                const drag = { fromFrame, targetFrame: null, startX: event.clientX, startY: event.clientY, flying: null, tip: null };
                this.keyBadgeDrag = drag;
                const cards = () => [...this.framesList.querySelectorAll('.frame-card')];
                const clearTarget = () => cards().forEach((card) => card.classList.remove('key-drop'));
                const move = (e) => {
                    if (!drag.flying) {
                        if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < 4) return;
                        drag.flying = badge.cloneNode(true);
                        drag.flying.classList.add('flying');
                        drag.tip = document.createElement('div');
                        drag.tip.className = 'key-drop-tip';
                        drag.tip.hidden = true;
                        document.body.append(drag.flying, drag.tip);
                        badge.classList.add('lifted');
                    }
                    drag.flying.style.left = `${e.clientX}px`;
                    drag.flying.style.top = `${e.clientY}px`;
                    clearTarget();
                    const card = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.frame-card');
                    const frame = card ? cards().indexOf(card) : -1;
                    // A key can't land on a frame that already has one.
                    const free = frame > -1 && frame !== fromFrame && !track.keyframes.some((key) => key.frame === frame);
                    drag.targetFrame = free ? frame : null;
                    drag.tip.hidden = !free;
                    if (!free) return;
                    card.classList.add('key-drop');
                    const box = card.getBoundingClientRect();
                    drag.tip.textContent = `Move key to frame ${frame + 1}`;
                    drag.tip.style.left = `${box.left + box.width / 2}px`;
                    drag.tip.style.top = `${box.top - 8}px`;
                };
                const end = (e) => {
                    badge.removeEventListener('pointermove', move);
                    badge.removeEventListener('pointerup', end);
                    badge.removeEventListener('pointercancel', end);
                    this.keyBadgeDrag = null;
                    clearTarget();
                    drag.flying?.remove();
                    drag.tip?.remove();
                    badge.classList.remove('lifted');
                    if (!drag.flying) return;
                    // The click that follows a drag shouldn't also pick a frame.
                    this.suppressKeyBadgeClick = true;
                    setTimeout(() => { this.suppressKeyBadgeClick = false; }, 0);
                    if (e.type === 'pointerup' && drag.targetFrame !== null) this.retimeMotionKeyframe(track, fromFrame, drag.targetFrame);
                };
                badge.addEventListener('pointermove', move);
                badge.addEventListener('pointerup', end);
                badge.addEventListener('pointercancel', end);
            }

            renderUI(minimal = false) {
                const frameScrollLeft = this.framesList.scrollLeft;
                if (!minimal) {
                    this.framesList.innerHTML = '';
                    const scrub = document.createElement('div');
                    scrub.className = 'frame-scrub';
                    scrub.id = 'frame-scrub';
                    scrub.tabIndex = 0;
                    scrub.title = 'Drag along here to flip through your frames';
                    scrub.setAttribute('role', 'slider');
                    scrub.setAttribute('aria-label', 'Scrub through frames');
                    scrub.innerHTML = '<div class="frame-playhead" aria-hidden="true"></div>';
                    scrub.onpointerdown = (event) => this.startFrameScrub(event);
                    this.framesList.appendChild(scrub);
                    this.frames.forEach((f, i) => {
                        const el = document.createElement('div');
                        el.className = `frame-card ${i === this.frameIndex ? 'active' : ''}`;
                        el.tabIndex = 0;
                        el.setAttribute('aria-label', `Frame ${i + 1}`);
                        el.onclick = (event) => this.handleFrameCardClick(i, event);

                        let html = `<div class="frame-num">${i + 1}</div><img src="${f.thumb || ''}">`;
                        if (this.frames.length > 1) {
                            html += `<div class="frame-delete-btn" onclick="event.stopPropagation(); app.deleteFrame(${i})" title="Delete Frame"><i class="fas fa-times"></i></div>`;
                        }
                        html += `<div class="frame-copy-btn" onclick="event.stopPropagation(); app.duplicateFrame(${i})" title="Duplicate Frame"><i class="fas fa-copy"></i></div>`;
                        el.innerHTML = html;
                        el.querySelector('img')?.setAttribute('alt', `Frame ${i + 1} thumbnail`);

                        el.draggable = true;
                        el.ondragstart = (e) => this.handleDragStart(e, i);
                        el.ondragover = (e) => this.handleDragOver(e);
                        el.ondragenter = (e) => this.handleDragEnter(e);
                        el.ondragleave = (e) => this.handleDragLeave(e);
                        el.ondrop = (e) => this.handleDrop(e, i);

                        this.framesList.appendChild(el);
                    });
                    // Frames keep their thumbnails, so only draw missing ones. Adding,
                    // removing or moving frames can re-place animated copies, so
                    // projects with motion tracks redraw them all.
                    this.updateThumbnails(this.motionTracks.length ? null : this.frames.flatMap((frame, index) => (frame.thumb ? [] : [index])));
                    const addButton = document.createElement('button');
                    addButton.type = 'button';
                    addButton.className = 'add-frame-btn';
                    addButton.setAttribute('aria-label', 'Add frame');
                    addButton.title = 'Add frame (A)';
                    addButton.innerHTML = '<i class="fas fa-plus" aria-hidden="true"></i>';
                    addButton.onclick = () => this.addFrame();
                    this.framesList.appendChild(addButton);
                    this.layoutFrameScrub();
                    this.framesList.scrollLeft = frameScrollLeft;
                } else {
                    const cards = this.framesList.querySelectorAll('.frame-card');
                    cards.forEach((c, i) => {
                        if (i === this.frameIndex) {
                            c.classList.add('active');
                            // While scrubbing, the strip stays put under the pointer.
                            if (!this.frameScrub) c.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'center' });
                        } else {
                            c.classList.remove('active');
                        }
                    });
                }
                this.updateFrameSelectionUI();
                this.syncFramePosition();
                this.syncFrameScrub();
                this.syncTimelineSettings();
                this.syncFrameActions();
                this.renderMotionTracks();
                this.renderGuide();
            }

            syncTimelineSettings() {
                const hold = this.getFrameHold();
                const holdDisplay = document.getElementById('frame-hold-disp');
                const loopButton = document.getElementById('loop-mode-btn');
                if (holdDisplay) holdDisplay.textContent = `×${hold}`;
                const less = document.getElementById('frame-hold-less');
                const more = document.getElementById('frame-hold-more');
                if (less) less.disabled = hold <= 1;
                if (more) more.disabled = hold >= 12;
                // Thumbnails are shaped like the canvas and show any hold.
                const ratio = Math.min(16 / 9, Math.max(4 / 3, this.canvasWidth / this.canvasHeight));
                this.framesList?.style.setProperty('--frame-card-ratio', ratio.toFixed(4));
                this.framesList?.querySelectorAll('.frame-card').forEach((card, index) => {
                    const num = card.querySelector('.frame-num');
                    if (!num) return;
                    const frameHold = this.getFrameHold(this.frames[index]);
                    let badge = num.querySelector('.frame-hold-badge');
                    if (frameHold > 1) {
                        if (!badge) {
                            badge = document.createElement('span');
                            badge.className = 'frame-hold-badge';
                            num.appendChild(badge);
                        }
                        badge.textContent = `×${frameHold}`;
                    } else {
                        badge?.remove();
                    }
                });
                if (loopButton) {
                    // The button names what Play will do; clicking switches to the other.
                    const isLoop = this.loopMode === 'loop';
                    loopButton.innerHTML = isLoop ? `${LOOP_ICON}<span>Loop</span>` : `${PLAY_ONCE_ICON}<span>Play once</span>`;
                    loopButton.classList.toggle('is-loop', isLoop);
                    loopButton.title = isLoop ? 'Play keeps repeating. Click to play once.' : 'Play stops at the last frame. Click to loop.';
                }
            }

            syncFramePosition() {
                const framePosition = document.getElementById('frame-position');
                if (framePosition) framePosition.textContent = `Frame ${this.frameIndex + 1} of ${this.frames.length}`;
                const previousButton = document.getElementById('previous-frame-btn');
                const nextButton = document.getElementById('next-frame-btn');
                if (previousButton) previousButton.disabled = this.frameIndex === 0;
                if (nextButton) nextButton.disabled = this.frameIndex === this.frames.length - 1;
            }

            handleDragStart(e, index) { if (this.keyBadgeDrag) { e.preventDefault(); return; } this.draggedFrameIndex = index; e.dataTransfer.effectAllowed = 'move'; e.currentTarget.style.opacity = '0.5'; }
            handleDragOver(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; return false; }
            handleDragEnter(e) { e.currentTarget.classList.add('drag-over'); }
            handleDragLeave(e) { e.currentTarget.classList.remove('drag-over'); }
            handleDrop(e, targetIndex) {
                e.stopPropagation();
                e.currentTarget.classList.remove('drag-over');
                e.currentTarget.style.opacity = '1';

                if (this.draggedFrameIndex === null || this.draggedFrameIndex === targetIndex) return;

                this.saveState();
                const frameToMove = this.frames[this.draggedFrameIndex];
                this.frames.splice(this.draggedFrameIndex, 1);
                this.frames.splice(targetIndex, 0, frameToMove);
                this.remapMotionTracksAfterReorder(this.draggedFrameIndex, targetIndex);

                if (this.frameIndex === this.draggedFrameIndex) {
                    this.frameIndex = targetIndex;
                } else {
                    if (this.draggedFrameIndex < this.frameIndex && targetIndex >= this.frameIndex) this.frameIndex--;
                    else if (this.draggedFrameIndex > this.frameIndex && targetIndex <= this.frameIndex) this.frameIndex++;
                }
                this.renderUI();
                this.renderCanvas();
                this.saveStorage();
                this.draggedFrameIndex = null;
            }

            updateTimelineActive() {
                const cards = this.framesList.querySelectorAll('.frame-card');
                cards.forEach((c, i) => c.classList.toggle('active', i === this.frameIndex));
                this.updateFrameSelectionUI();
                this.syncFramePosition();
            }

            renderFrameToContext(targetCtx, frame, transparent = false) {
                if (!this.exportForegroundCanvas) {
                    this.exportForegroundCanvas = document.createElement('canvas');
                    this.exportForegroundCtx = this.exportForegroundCanvas.getContext('2d');
                }
                if (this.exportForegroundCanvas.width !== this.canvasWidth || this.exportForegroundCanvas.height !== this.canvasHeight) {
                    this.exportForegroundCanvas.width = this.canvasWidth;
                    this.exportForegroundCanvas.height = this.canvasHeight;
                }

                const fgCtx = this.exportForegroundCtx;
                const bgColor = frame.frameBgColor || this.selectedBgColor;
                this.currentRenderBgColor = transparent ? 'rgba(0,0,0,0)' : bgColor;

                targetCtx.save();
                targetCtx.globalCompositeOperation = 'source-over';
                targetCtx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
                if (!transparent) {
                    targetCtx.fillStyle = bgColor;
                    targetCtx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
                    this.drawBackgroundImage(targetCtx);
                }
                targetCtx.globalAlpha = 1.0;
                this.getPaperStrokes(frame).forEach(s => this.drawObject(targetCtx, s, false, 'paper'));
                targetCtx.restore();

                fgCtx.globalCompositeOperation = 'source-over';
                fgCtx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
                fgCtx.globalAlpha = 1.0;
                frame.strokes.forEach(s => this.drawObject(fgCtx, s, false, 'ink'));

                targetCtx.globalCompositeOperation = 'source-over';
                targetCtx.globalAlpha = 1.0;
                targetCtx.drawImage(this.exportForegroundCanvas, 0, 0);
                this.currentRenderBgColor = null;
            }

            // Redraws the given frame indexes, or every frame when none are given.
            // Each thumbnail renders the whole frame, so heavy projects took
            // seconds when every edit redrew all of them.
            updateThumbnails(indices = null) {
                const targets = indices ?? this.frames.map((_, index) => index);
                if (!targets.length) return;
                const tCanvas = document.createElement('canvas');
                tCanvas.width = 120; tCanvas.height = 120;
                const tCtx = tCanvas.getContext('2d');
                const scale = 120 / this.canvasWidth;
                tCtx.scale(scale, scale);

                const imgs = this.framesList.querySelectorAll('.frame-card img');
                targets.forEach((index) => {
                    const frame = this.frames[index];
                    if (!frame) return;
                    this.renderFrameToContext(tCtx, frame);
                    frame.thumb = tCanvas.toDataURL();
                    if (imgs[index]) imgs[index].src = frame.thumb;
                });
            }

            // An artwork edit changes only the current frame, unless the project has
            // animated artwork: motion tracks place copies across frames.
            updateEditedThumbnails() {
                this.updateThumbnails(this.motionTracks.length ? null : [this.frameIndex]);
            }

            // Same as updateEditedThumbnails, but waits until edits that repeat
            // quickly (style sliders) settle. Frames are tracked by object so the
            // queue survives frames being added or removed meanwhile.
            queueEditedThumbnails() {
                if (!this.pendingThumbnailFrames) this.pendingThumbnailFrames = new Set();
                (this.motionTracks.length ? this.frames : [this.frames[this.frameIndex]]).forEach((frame) => this.pendingThumbnailFrames.add(frame));
                clearTimeout(this.thumbnailTimer);
                this.thumbnailTimer = setTimeout(() => {
                    const pending = this.pendingThumbnailFrames;
                    this.pendingThumbnailFrames = new Set();
                    this.updateThumbnails(this.frames.flatMap((frame, index) => (pending.has(frame) ? [index] : [])));
                }, 250);
            }

            saveStorage(changed = true) {
                if (changed) this.fileSaved = false;
                this.setSaveStatus('saving');
                if (this.saveTimer) clearTimeout(this.saveTimer);
                this.saveTimer = setTimeout(() => {
                    const data = {
                        version: 7,
                        savedToFile: this.fileSaved,
                        backgroundImage: this.backgroundImage,
                        name: this.projectName,
                        frames: this.frames,
                        motionTracks: this.motionTracks,
                        fps: this.fps,
                        width: this.canvasWidth,
                        height: this.canvasHeight,
                        palette: this.palette
                    };
                    try {
                        const cleanFrames = this.frames.map(f => ({
                            strokes: f.strokes,
                            paperStrokes: this.getPaperStrokes(f),
                            frameBgColor: f.frameBgColor,
                            hold: this.getFrameHold(f)
                        }));
                        const jsonStr = JSON.stringify({ ...data, frames: cleanFrames });

                        const size = jsonStr.length;
                        const limit = 100 * 1024 * 1024;
                        const pct = Math.min(100, (size / limit) * 100);

                        const storageLabel = document.querySelector('.storage-label');
                        if (storageLabel) storageLabel.textContent = `Browser storage: ${pct < 1 ? 'under 1%' : `${Math.round(pct)}%`} used`;
                        const bar = document.getElementById('storage-bar');
                        if (bar) {
                            bar.style.width = pct + '%';
                            if (pct > 90) bar.style.background = '#ff3b30';
                            else if (pct > 70) bar.style.background = '#f1c40f';
                            else bar.style.background = '#2ecc71';
                        }
                        this.db.set('currentProject', jsonStr).then(() => this.setSaveStatus('saved')).catch((e) => {
                            console.log("IDB Error", e);
                            this.setSaveStatus('error');
                        });
                    } catch (e) {
                        console.log("Serialization Error", e);
                        this.setSaveStatus('error');
                    }
                }, 1000);
            }

            setSaveStatus(state) {
                const status = document.getElementById('save-status');
                const text = document.getElementById('save-status-text');
                if (!status || !text) return;
                status.hidden = false;
                text.textContent = { saving: 'Saving…', saved: 'Saved in this browser', error: 'Couldn’t save in this browser' }[state];
                status.classList.toggle('is-saving', state === 'saving');
                status.classList.toggle('is-error', state === 'error');
                status.title = state === 'error'
                    ? 'This browser couldn’t keep your work. Save a project file to be safe.'
                    : 'Your work is kept in this browser as you go';
            }

            // Work that isn't in a project file yet would be lost by New.
            hasUnsavedWork() {
                if (this.fileSaved) return false;
                return this.frames.length > 1 || this.motionTracks.length > 0 || Boolean(this.backgroundImage) ||
                    this.frames.some((frame) => frame.strokes.length || this.getPaperStrokes(frame).length);
            }

            syncProjectNameUI() {
                const input = document.getElementById('project-name');
                if (input) input.value = this.projectName || 'Untitled';
            }

            async loadStorage() {
                const request = ++this.projectLoadRequest;
                try {
                    const jsonStr = await this.db.get('currentProject');
                    if (request !== this.projectLoadRequest) return;
                    if (jsonStr) {
                        const data = JSON.parse(jsonStr);
                        if (data.version >= 2) {
                            const backgroundImage = await this.decodeBackgroundImage(data.backgroundImage);
                            if (request !== this.projectLoadRequest) return;
                            this.backgroundImage = backgroundImage;
                            this.frames = this.normalizeFrames(data.frames, data.paperStrokes, data.sharedStrokes);
                            this.motionTracks = this.normalizeMotionTracks(data.motionTracks || []);
                            this.clearFrameSelection(false);
                            this.fps = this.normalizeFps(data.fps);
                            this.syncFpsUI();
                            this.frameIndex = 0;
                            this.projectName = typeof data.name === 'string' && data.name.trim() ? data.name : 'Untitled';
                            this.fileSaved = data.savedToFile === true;
                            if (data.width && data.height) this.resizeCanvas(data.width, data.height);
                            if (data.palette) { this.palette = data.palette; this.renderPalette(); }
                            this.renderUI();
                            this.syncProjectNameUI();
                            this.renderCanvas();
                            this.setSaveStatus('saved');
                            return true;
                        }
                    }
                } catch (e) { console.log('Error loading', e); }
                return false;
            }

            exportFrame(transparent = false) {
                const tempC = document.createElement('canvas');
                tempC.width = this.canvasWidth;
                tempC.height = this.canvasHeight;
                const tCtx = tempC.getContext('2d');
                const frame = this.frames[this.frameIndex];
                this.renderFrameToContext(tCtx, frame, transparent);

                const a = document.createElement('a');
                const frameNumber = String(this.frameIndex + 1).padStart(3, '0');
                a.href = tempC.toDataURL('image/png');
                a.download = `${this.getExportBaseName()}-frame-${frameNumber}${transparent ? '-transparent' : ''}.png`;
                a.click();
                this.showExportNotice(`${transparent ? 'Transparent ' : ''}frame ${frameNumber} exported`);
            }

            exportSVG() {
                const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);
                const maskDefs = [];
                let maskIndex = 0;
                const withHoles = (object, output) => {
                    if (!object.holes || !object.holes.length) return output;
                    const id = `eraser-mask-${maskIndex++}`;
                    const holes = object.holes.map(hole => {
                        if (!this.isSweepHole(hole)) return `<polygon points="${hole.map((point) => `${point.x},${point.y}`).join(' ')}" fill="black"/>`;
                        if (hole.path.length === 1) return `<circle cx="${hole.path[0].x}" cy="${hole.path[0].y}" r="${hole.r}" fill="black"/>`;
                        return `<polyline points="${hole.path.map((point) => `${point.x},${point.y}`).join(' ')}" fill="none" stroke="black" stroke-width="${hole.r * 2}" stroke-linecap="round" stroke-linejoin="round"/>`;
                    }).join('');
                    maskDefs.push(`<mask id="${id}" maskUnits="userSpaceOnUse"><rect width="${this.canvasWidth}" height="${this.canvasHeight}" fill="white"/>${holes}</mask>`);
                    return `<g mask="url(#${id})">${output}</g>`;
                };
                const render = (object) => {
                    if (object.type === 'group') return object.items.map(render).join('');
                    const points = object.points || [];
                    const opacity = object.opacity ?? 1;
                    const style = `stroke="${object.color || '#000'}" stroke-opacity="${opacity}" fill="${object.fillColor || 'none'}" fill-opacity="${opacity}" stroke-width="${object.size || 1}" stroke-linecap="round" stroke-linejoin="round"`;
                    if (object.type === 'text') return withHoles(object, `<text x="${object.x}" y="${object.y}" fill="${object.color}" fill-opacity="${opacity}" font-family="sans-serif" font-size="${object.size}">${escape(object.text)}</text>`);
                    if (!points.length) return '';
                    if (object.type === 'fill') {
                        const d = points.map((point, index) => `${index === 0 ? 'M' : point.m ? 'Z M' : 'L'}${point.x} ${point.y}`).join(' ') + ' Z';
                        return withHoles(object, `<path d="${d}" fill="${object.fillColor || object.color}" fill-opacity="${opacity}" fill-rule="evenodd" stroke="none"/>`);
                    }
                    const brushScale = this.scalesLineWidth(object) ? this.getBrushScale(object) : { x: 1, y: 1 };
                    const useBrushScale = this.scalesLineWidth(object) && (brushScale.x !== 1 || brushScale.y !== 1);
                    const pointBounds = useBrushScale ? this.getPointBounds(points) : null;
                    const brushCenter = pointBounds
                        ? { x: pointBounds.x + pointBounds.w / 2, y: pointBounds.y + pointBounds.h / 2 }
                        : null;
                    const pathPoints = useBrushScale
                        ? points.map((point) => ({
                            x: brushCenter.x + (point.x - brushCenter.x) / brushScale.x,
                            y: brushCenter.y + (point.y - brushCenter.y) / brushScale.y
                        }))
                        : points;
                    const path = pathPoints.map((point) => `${point.x},${point.y}`).join(' ');
                    let output;
                    if (object.type === 'circle' && points.length > 1) { const [a, b] = points; const radius = Math.hypot(b.x - a.x, b.y - a.y); output = `<circle cx="${a.x}" cy="${a.y}" r="${radius}" ${style}/>`; }
                    else if (object.type === 'rect' && points.length > 1) { const [a, b] = points; output = `<rect x="${Math.min(a.x,b.x)}" y="${Math.min(a.y,b.y)}" width="${Math.abs(b.x-a.x)}" height="${Math.abs(b.y-a.y)}" ${style}/>`; }
                    else output = `<polyline points="${path}" ${style}/>`;
                    if (useBrushScale) {
                        output = `<g transform="translate(${brushCenter.x} ${brushCenter.y}) scale(${brushScale.x} ${brushScale.y}) translate(${-brushCenter.x} ${-brushCenter.y})">${output}</g>`;
                    }
                    output = withHoles(object, output);
                    return object.symmetric && object.type === 'brush' ? output + render(this.getMirroredStroke(object)) : output;
                };
                const frame = this.frames[this.frameIndex];
                const background = frame.frameBgColor || this.selectedBgColor;
                const content = [...this.getPaperStrokes(frame), ...frame.strokes].map(render).join('');
                const placement = this.getBackgroundImagePlacement();
                const imageMarkup = placement ? `<image href="${escape(this.backgroundImage.dataUrl)}" x="${placement.x}" y="${placement.y}" width="${placement.width}" height="${placement.height}"/>` : '';
                const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${this.canvasWidth}" height="${this.canvasHeight}" viewBox="0 0 ${this.canvasWidth} ${this.canvasHeight}"><defs>${maskDefs.join('')}</defs><rect width="100%" height="100%" fill="${background}"/>${imageMarkup}${content}</svg>`;
                const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
                const link = document.createElement('a'); link.href = url; link.download = `${this.getExportBaseName()}-frame-${String(this.frameIndex + 1).padStart(3, '0')}.svg`; link.click(); URL.revokeObjectURL(url);
                this.showExportNotice('SVG exported');
            }

            async exportPNGSequence() {
                const total = this.frames.length;
                const tempC = document.createElement('canvas');
                tempC.width = this.canvasWidth;
                tempC.height = this.canvasHeight;
                const tCtx = tempC.getContext('2d');
                const zip = new JSZip();

                try {
                    const exportBaseName = this.getExportBaseName();
                    this.setExportProgress(`Preparing frame 1 of ${total}…`);
                    for (let index = 0; index < total; index++) {
                        this.renderFrameToContext(tCtx, this.frames[index]);
                        const image = await new Promise((resolve) => tempC.toBlob(resolve, 'image/png'));
                        if (!image) throw new Error('PNG encoding failed');
                        zip.file(`${exportBaseName}-frame-${String(index + 1).padStart(3, '0')}.png`, image);
                        this.setExportProgress(`Preparing frame ${index + 1} of ${total}…`);
                    }

                    this.setExportProgress('Packing PNG sequence…');
                    const archive = await zip.generateAsync({ type: 'blob' });
                    const url = URL.createObjectURL(archive);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = `${exportBaseName}-png-sequence.zip`;
                    link.click();
                    setTimeout(() => URL.revokeObjectURL(url), 0);
                    this.setExportProgress('', false);
                    this.showExportNotice(`${total} PNG frame${total === 1 ? '' : 's'} exported`);
                } catch (error) {
                    console.error('PNG sequence export failed', error);
                    this.setExportProgress('', false);
                    this.showExportNotice('PNG sequence export failed', true);
                }
            }

            getVideoSupport() {
                const hasRecorder = typeof window.MediaRecorder === 'function';
                const hasCaptureStream = typeof HTMLCanvasElement.prototype.captureStream === 'function';
                if (!hasRecorder || !hasCaptureStream) {
                    return { available: false, codecMimeType: null, fallbackMimeType: null, mimeType: null };
                }

                const isSupported = (mimeType) => {
                    try {
                        return typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(mimeType);
                    } catch {
                        return false;
                    }
                };
                const vp8 = 'video/webm;codecs=vp8';
                const vp9 = 'video/webm;codecs=vp9';
                const fallback = 'video/webm';
                const codecMimeType = [vp8, vp9].find(isSupported) || null;
                const fallbackMimeType = isSupported(fallback) ? fallback : null;
                return {
                    available: true,
                    codecMimeType,
                    fallbackMimeType,
                    mimeType: codecMimeType || fallbackMimeType
                };
            }

            async flushMediaRecorder(recorder) {
                if (typeof recorder.requestData !== 'function') return;
                await new Promise((resolve) => {
                    let settled = false;
                    const finish = () => {
                        if (settled) return;
                        settled = true;
                        resolve();
                    };
                    recorder.addEventListener('dataavailable', finish, { once: true });
                    try {
                        recorder.requestData();
                    } catch {
                        finish();
                        return;
                    }
                    setTimeout(finish, 0);
                });
            }

            async exportWebM() {
                const videoSupport = this.getVideoSupport();
                if (!videoSupport.available) {
                    this.showExportNotice('Video export is unavailable in this browser', true);
                    return;
                }

                const tempC = document.createElement('canvas');
                tempC.width = this.canvasWidth;
                tempC.height = this.canvasHeight;
                const tCtx = tempC.getContext('2d');
                const stream = tempC.captureStream(this.fps);
                const recorder = new MediaRecorder(stream, videoSupport.mimeType ? { mimeType: videoSupport.mimeType } : undefined);
                const chunks = [];
                const total = this.frames.length;
                const frameDuration = 1000 / this.fps;

                recorder.addEventListener('dataavailable', (event) => {
                    if (event.data.size) chunks.push(event.data);
                });

                const completed = new Promise((resolve, reject) => {
                    recorder.addEventListener('stop', resolve, { once: true });
                    recorder.addEventListener('error', () => reject(new Error('Video recording failed')), { once: true });
                });

                try {
                    recorder.start();
                    for (let index = 0; index < total; index++) {
                        const frame = this.frames[index];
                        const hold = this.getFrameHold(frame);
                        this.renderFrameToContext(tCtx, frame);
                        this.setExportProgress(`Recording frame ${index + 1} of ${total}…`);
                        for (let tick = 0; tick < hold; tick++) {
                            stream.getVideoTracks()[0]?.requestFrame?.();
                            await new Promise((resolve) => setTimeout(resolve, frameDuration));
                        }
                    }
                    this.setExportProgress('Finishing video…');
                    await this.flushMediaRecorder(recorder);
                    recorder.stop();
                    await completed;
                    stream.getTracks().forEach((track) => track.stop());

                    const url = URL.createObjectURL(new Blob(chunks, { type: recorder.mimeType || 'video/webm' }));
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = `${this.getExportBaseName()}.webm`;
                    link.click();
                    setTimeout(() => URL.revokeObjectURL(url), 0);
                    this.setExportProgress('', false);
                    this.showExportNotice('WebM video exported');
                } catch (error) {
                    console.error('WebM export failed', error);
                    if (recorder.state !== 'inactive') recorder.stop();
                    stream.getTracks().forEach((track) => track.stop());
                    this.setExportProgress('', false);
                    this.showExportNotice('Video export failed', true);
                }
            }

            setExportProgress(message, visible = true) {
                const overlay = document.getElementById('loading-overlay');
                const status = document.getElementById('loading-status');
                if (status) status.textContent = message;
                if (overlay) overlay.style.display = visible ? 'flex' : 'none';
            }

            showExportNotice(message, isError = false) {
                const indicator = document.getElementById('save-indicator');
                if (!indicator) return;
                indicator.innerHTML = `<i class="fas fa-${isError ? 'exclamation-triangle' : 'check'}"></i> ${message}`;
                // Dark enough for white text to read clearly (WCAG AA).
                indicator.style.background = isError ? 'rgb(196, 43, 28)' : 'rgb(22, 128, 61)';
                indicator.style.opacity = 1;
                setTimeout(() => indicator.style.opacity = 0, 2200);
            }

            exportGIF() {
                if (!window.gifshot?.createGIF) {
                    this.showExportNotice('GIF export is unavailable in this browser', true);
                    return;
                }
                this.setExportProgress(`Preparing ${this.frames.length} frame${this.frames.length === 1 ? '' : 's'}…`);
                const framesData = [];
                const tempC = document.createElement('canvas');
                tempC.width = this.canvasWidth; tempC.height = this.canvasHeight;
                const tCtx = tempC.getContext('2d');

                setTimeout(() => {
                    this.frames.forEach((f, index) => {
                        this.renderFrameToContext(tCtx, f);
                        framesData.push(tempC.toDataURL());
                        this.setExportProgress(`Preparing frame ${index + 1} of ${this.frames.length}…`);
                    });

                    this.setExportProgress('Encoding GIF…');
                    gifshot.createGIF({
                        images: framesData,
                        interval: 1 / this.fps,
                        gifWidth: this.canvasWidth, gifHeight: this.canvasHeight
                    }, (obj) => {
                        this.setExportProgress('', false);
                        if (!obj.error) {
                            const a = document.createElement('a');
                            a.href = obj.image;
                            a.download = `${this.getExportBaseName()}.gif`;
                            a.click();
                            this.showExportNotice('Animated GIF exported');
                        } else {
                            this.showExportNotice('GIF export failed. Try a smaller canvas.', true);
                        }
                    });
                }, 30);
            }

            showGifWarning() {
                const modal = document.getElementById('gif-warning-modal');
                const count = document.getElementById('gif-warning-frame-count');
                const videoButton = document.getElementById('gif-warning-video');
                const unavailable = document.getElementById('gif-warning-video-unavailable');
                if (!modal || !count || !videoButton || !unavailable) return;

                const videoSupport = this.getVideoSupport();
                const hasRecommendedVideo = Boolean(videoSupport.codecMimeType);
                count.textContent = this.frames.length;
                videoButton.hidden = !hasRecommendedVideo;
                videoButton.disabled = !hasRecommendedVideo;
                unavailable.hidden = hasRecommendedVideo;
                if (!hasRecommendedVideo) {
                    unavailable.textContent = 'Video export is unsupported in this browser. You can still export the GIF.';
                }
                this.openModal('gif-warning-modal', hasRecommendedVideo ? 'gif-warning-video' : 'gif-warning-gif');
            }

            confirmGifWarning(format) {
                this.closeModal('gif-warning-modal');
                if (format === 'webm') this.exportWebM();
                else if (format === 'gif') this.exportGIF();
            }

            saveProject() {
                const data = {
                    version: 7,
                    backgroundImage: this.backgroundImage,
                    name: this.projectName,
                    frames: this.frames.map(f => ({
                        strokes: f.strokes,
                        paperStrokes: this.getPaperStrokes(f),
                        frameBgColor: f.frameBgColor,
                        hold: this.getFrameHold(f)
                    })),
                    motionTracks: this.motionTracks,
                    fps: this.fps,
                    width: this.canvasWidth,
                    height: this.canvasHeight,
                    palette: this.palette
                };
                const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                const safeName = this.getExportBaseName();
                a.href = url; a.download = `${safeName}.json`;
                a.click();
                this.fileSaved = true;
                this.saveStorage(false);
                this.updateNewAnimationWarning();
            }

            getExportBaseName() {
                return this.sanitizeProjectName(this.projectName) || 'motionsketch';
            }

            sanitizeProjectName(name) {
                return String(name || '').trim().replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').slice(0, 80);
            }

            setProjectName(name) {
                const clean = String(name || '').trim().slice(0, 80);
                this.projectName = clean || 'Untitled';
                const input = document.getElementById('project-name');
                if (input) input.value = this.projectName;
                this.saveStorage();
            }

            openProject() { document.getElementById('file-input').click(); }

            handleFileUpload(el) {
                const file = el.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = async (e) => {
                    try {
                        const data = JSON.parse(e.target.result);
                        await this.importProjectData(data);
                    } catch (err) {
                        this.showExportNotice(err instanceof SyntaxError ? 'Invalid project file' : (err.message || 'Invalid project file'), true);
                    }
                    el.value = '';
                };
                reader.onerror = () => {
                    this.showExportNotice('Could not read project file', true);
                    el.value = '';
                };
                reader.readAsText(file);
            }

            importProjectData(data) {
                if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid project file');
                const version = Number.parseInt(data.version, 10);
                if (!Number.isInteger(version) || version < 2 || version > 7) throw new Error('This project version is not supported');
                if (!Array.isArray(data.frames) || !data.frames.length) throw new Error('Project has no usable frames');

                const request = ++this.projectLoadRequest;
                if (data.backgroundImage != null) {
                    return this.decodeBackgroundImage(data.backgroundImage).then(image => {
                        if (request === this.projectLoadRequest) this.applyImportedProject(data, version, image);
                    });
                }
                this.applyImportedProject(data, version, null);
            }

            applyImportedProject(data, version, backgroundImage) {
                this.backgroundImage = backgroundImage;
                this.backgroundImageRequest++;

                this.frames = this.normalizeFrames(data.frames, data.paperStrokes, data.sharedStrokes);
                this.motionTracks = this.normalizeMotionTracks(data.motionTracks || []);
                this.clearFrameSelection(false);
                this.fps = this.normalizeFps(data.fps);
                this.syncFpsUI();
                this.frameIndex = 0;
                this.projectName = typeof data.name === 'string' && data.name.trim() ? data.name : 'Untitled';
                if (data.width && data.height) this.resizeCanvas(data.width, data.height);
                if (Array.isArray(data.palette)) { this.palette = data.palette; this.renderPalette(); }
                this.renderUI();
                this.syncProjectNameUI();
                this.renderCanvas();
                this.fileSaved = true;
                this.saveStorage(false);
                this.showExportNotice(version < 7 ? 'Project upgraded and opened' : 'Project opened');
            }

            setFlyoutExpanded(wrapperId, anchorId, expanded) {
                const wrapper = document.getElementById(wrapperId);
                wrapper?.classList.toggle('expanded', expanded);
                document.getElementById(anchorId)?.setAttribute('aria-expanded', String(expanded));
                if (expanded && document.body.classList.contains('truck-active')) {
                    this.portalTruckFlyout(wrapperId);
                    this.positionTruckFlyout(wrapperId);
                }
                if (!expanded) {
                    const menu = wrapper?.querySelector('.flyout-menu') || document.querySelector(`.flyout-menu[data-flyout-wrapper="${wrapperId}"]`);
                    if (menu) {
                        if (menu.dataset.flyoutWrapper) wrapper?.appendChild(menu);
                        delete menu.dataset.flyoutWrapper;
                        menu.classList.remove('is-portal-flyout');
                        menu.style.position = '';
                        menu.style.left = '';
                        menu.style.top = '';
                    }
                }
            }

            portalTruckFlyout(wrapperId) {
                if (!document.body.classList.contains('truck-active')) return;
                const wrapper = document.getElementById(wrapperId);
                const menu = wrapper?.querySelector('.flyout-menu') || document.querySelector(`.flyout-menu[data-flyout-wrapper="${wrapperId}"]`);
                if (!wrapper || !menu) return;
                if (menu.parentElement !== document.body) document.body.appendChild(menu);
                menu.dataset.flyoutWrapper = wrapperId;
            }

            positionTruckFlyout(wrapperId) {
                const wrapper = document.getElementById(wrapperId);
                const menu = wrapper?.querySelector('.flyout-menu') || document.querySelector(`.flyout-menu[data-flyout-wrapper="${wrapperId}"]`);
                const tools = document.querySelector('.tools-panel');
                if (!wrapper || !menu || !tools || !document.body.classList.contains('truck-active')) return;
                if (menu.parentElement !== document.body) this.portalTruckFlyout(wrapperId);
                const wrapperRect = wrapper.getBoundingClientRect();
                const toolsRect = tools.getBoundingClientRect();
                const menuHeight = menu.offsetHeight || 54;
                const top = Math.max(8, Math.min(wrapperRect.top, window.innerHeight - menuHeight - 8));
                menu.style.position = 'fixed';
                menu.style.left = `${Math.round(toolsRect.right + 8)}px`;
                menu.style.top = `${Math.round(top)}px`;
                if (!menu.classList.contains('is-portal-flyout')) {
                    requestAnimationFrame(() => {
                        if (menu.parentElement === document.body && document.body.classList.contains('truck-active') && (wrapper.matches(':hover') || wrapper.classList.contains('expanded'))) {
                            menu.classList.add('is-portal-flyout');
                        }
                    });
                }
            }

            toggleFlyout(wrapperId, anchorId) {
                const wrapper = document.getElementById(wrapperId);
                this.setFlyoutExpanded(wrapperId, anchorId, !wrapper?.classList.contains('expanded'));
            }

            setExportMenuOpen(open, returnFocus = false) {
                const menu = document.getElementById('export-menu');
                const toggle = document.getElementById('export-menu-toggle');
                if (!menu || !toggle) return;
                menu.hidden = !open;
                toggle.setAttribute('aria-expanded', String(open));
                if (open) this.positionHeaderMenu(menu, toggle, 212, 260);
                if (returnFocus) toggle.focus();
            }

            toggleExportMenu() {
                this.setExportMenuOpen(document.getElementById('export-menu')?.hidden);
            }

            // File: New, Open and Save project file, with the storage meter.
            setFileMenuOpen(open, returnFocus = false) {
                const menu = document.getElementById('file-menu');
                const toggle = document.getElementById('file-menu-toggle');
                if (!menu || !toggle) return;
                menu.hidden = !open;
                toggle.setAttribute('aria-expanded', String(open));
                if (open) this.positionHeaderMenu(menu, toggle, 280, 240, 'left');
                if (returnFocus) toggle.focus();
            }

            toggleFileMenu() {
                this.setFileMenuOpen(document.getElementById('file-menu')?.hidden);
            }

            runFileAction(action) {
                this.setFileMenuOpen(false);
                ({
                    new: () => this.requestNewAnimation(),
                    open: () => this.openProject(),
                    save: () => this.saveProject(),
                    'whats-new': () => this.showWhatsNew(),
                    'getting-started': () => this.showWelcome(false),
                    shortcuts: () => this.toggleShortcuts()
                }[action])?.();
            }

            readPref(key) {
                try { return localStorage.getItem(key); } catch (e) { return null; }
            }

            writePref(key, value) {
                try { localStorage.setItem(key, value); } catch (e) { /* storage blocked */ }
            }

            toggleShortcuts() {
                const modal = document.getElementById('shortcuts-modal');
                if (modal?.getAttribute('aria-hidden') === 'false') this.closeModal('shortcuts-modal');
                else this.openModal('shortcuts-modal', 'shortcuts-close');
            }

            // Getting started: a welcome card with the three steps. On a first
            // visit What's new has nothing to tell, so it is marked as read.
            showWelcome(firstVisit) {
                if (firstVisit) {
                    this.writePref('motionSketchWhatsNew', WHATS_NEW_VERSION);
                    this.syncWhatsNew();
                }
                this.writePref(GUIDE_KEY, 'seen');
                const unsaved = document.getElementById('welcome-unsaved');
                if (unsaved) unsaved.hidden = !this.hasUnsavedWork();
                const title = document.getElementById('welcome-unsaved-title');
                if (title) title.textContent = `“${this.projectName || 'Untitled'}” isn’t saved as a file yet.`;
                this.openModal('welcome-modal', 'welcome-start');
            }

            startGuide() {
                this.closeModal('welcome-modal');
                if (!['brush', 'rect', 'circle', 'line'].includes(this.tool)) this.setTool('brush');
                this.guideStep = 1;
                this.renderGuide();
            }

            endGuide() {
                this.guideStep = 0;
                this.writePref(GUIDE_KEY, 'done');
                this.renderGuide();
            }

            guideEvent(type) {
                const step = this.guideStep;
                if (step === 1 && type === 'stroke') this.guideStep = 2;
                else if (step === 2 && type === 'frame') {
                    // Onion skin shows the last drawing, so the next one can follow on.
                    if (!this.isOnion) {
                        const panel = document.querySelector('.props-panel');
                        const scroll = panel?.scrollTop;
                        this.toggleOnion();
                        if (panel) panel.scrollTop = scroll;
                    }
                    this.guideStep = 3;
                } else if (step === 3 && type === 'stroke' && this.frameIndex > 0) this.guideStep = 4;
                else if (step === 4 && type === 'play') this.guideStep = 5;
                else return;
                this.renderGuide();
            }

            // Draws the coach mark for the current step beside the real control.
            renderGuide() {
                const coach = document.getElementById('guide-coach');
                const ring = document.getElementById('guide-ring');
                if (!coach || !ring) return;
                const step = this.guideStep;
                // Out of the way while the panels are hidden or a dialog is open.
                const show = Boolean(step) && !this.panelsHidden && !document.querySelector('.modal-overlay[aria-hidden="false"]');
                coach.hidden = !show;
                ring.hidden = true;
                if (!show) return;
                const touch = window.matchMedia?.('(pointer: coarse)').matches;
                const press = touch ? 'Tap' : 'Press';
                const dots = (n) => `<span class="guide-dots">${[1, 2, 3].map((i) => `<i class="${i < n ? 'done' : i === n ? 'on' : ''}"></i>`).join('')} Step ${n} of 3</span>`;
                const top = (label) => `<div class="guide-top">${label}<button type="button" class="guide-skip" onclick="app.endGuide()">${step === 'sample' ? 'Close' : 'Skip guide'}</button></div>`;
                const paper = document.getElementById('canvas-wrapper').getBoundingClientRect();
                const ghost = this.frames[this.frameIndex - 1]?.strokes?.length ? this.getStrokeBounds(this.frames[this.frameIndex - 1].strokes[0]) : null;
                const ghostY = ghost ? paper.top + (ghost.y + ghost.h / 2) / this.canvasHeight * paper.height : paper.top + paper.height * 0.36;
                const steps = {
                    1: { html: `${top(dots(1))}<b class="guide-title">Draw something</b><p>Use the Brush to draw on the white paper.</p><p class="quiet">Next, we’ll add a frame.</p>`, paper: paper.top + paper.height * 0.36 },
                    2: { html: `${top(dots(2))}<b class="guide-title">Nice. Now add a frame</b><p>${press} <b>+</b> to make frame 2.${touch ? '' : ' <span class="quiet">Or press <kbd>A</kbd>.</span>'}</p>`, target: '#frames-list .add-frame-btn', side: 'right', ring: 'round' },
                    3: { html: `${top(dots(2))}<b class="guide-title">Draw it again, a bit further along</b><p>The faint blue <span class="guide-ghost"></span> is your last frame. This is called onion skin.</p><p class="quiet">We switched Onion skin on for you.</p>`, paper: ghostY, softRing: '#onion-btn' },
                    4: { html: `${top(dots(3))}<b class="guide-title">${press} Play</b><p>Watch your drawing move.</p>${touch ? '' : '<p class="quiet">Or press <kbd>Space</kbd>.</p>'}`, target: '#play-btn', side: 'top', ring: 'round' },
                    5: { html: `<div class="guide-top"><span class="guide-dots"><i class="done"></i><i class="done"></i><i class="done"></i> All done</span></div><b class="guide-title">Nice. That’s animation!</b><p>Add more frames to make it longer. Small steps between drawings make it smoother.</p><div class="guide-btns"><button type="button" class="guide-alt" onclick="app.openSample()">See a sample</button><button type="button" class="btn-primary" onclick="app.endGuide()">Done</button></div>${touch ? '' : '<p class="quiet" style="margin-top:9px">Press <kbd>?</kbd> for keyboard shortcuts.</p>'}`, target: '#play-btn', side: 'top' },
                    sample: { html: `${top('<span class="guide-dots sample"><i class="fas fa-star" aria-hidden="true" style="background:none;width:auto;height:auto;font-size:11px"></i> Sample</span>')}<b class="guide-title">Bouncing ball</b><p>12 frames. The ball moves with the <b>Motion</b> tool: the blue line is its path, and the yellow marks are its keys.</p><p>${press} Play. Then drag a key to change the bounce.</p><p class="quiet">This is your own copy, so change anything.</p>`, paper: paper.top + paper.height * 0.4 }
                }[step];
                const gap = 14;
                // Beside the paper, on whichever side has room; narrower if need be.
                const tools = document.querySelector('.tools-panel')?.getBoundingClientRect();
                const props = document.querySelector('.props-panel')?.getBoundingClientRect();
                const roomLeft = paper.left - (tools?.right || 0) - gap - 8;
                const roomRight = (props?.left || window.innerWidth) - paper.right - gap - 8;
                const besideWidth = Math.min(226, Math.max(roomLeft, roomRight));
                coach.classList.toggle('touch', Boolean(touch));
                coach.classList.remove('inside');
                coach.style.width = step === 2 ? '300px' : (!steps.target && besideWidth >= 180 ? `${besideWidth}px` : '');
                coach.innerHTML = `${steps.html}<span class="guide-arrow"></span>`;
                const w = coach.offsetWidth;
                const h = coach.offsetHeight;
                let x;
                let y;
                let side = steps.side;
                if (steps.target) {
                    const box = document.querySelector(steps.target)?.getBoundingClientRect();
                    if (!box) { coach.hidden = true; return; }
                    if (steps.ring) {
                        const pad = 5;
                        ring.className = `guide-ring ${steps.ring}`;
                        Object.assign(ring.style, { left: `${box.left - pad}px`, top: `${box.top - pad}px`, width: `${box.width + pad * 2}px`, height: `${box.height + pad * 2}px` });
                        ring.hidden = false;
                    }
                    x = side === 'right' ? box.right + 6 : box.left + box.width / 2;
                    y = side === 'right' ? box.top + box.height / 2 : box.top;
                    if (side === 'right' && x + gap + w > window.innerWidth - 8) { side = 'top'; x = box.left + box.width / 2; y = box.top; }
                } else {
                    side = roomLeft >= w ? 'left' : roomRight >= w ? 'right' : 'inside';
                    // With no room beside the paper it sits on it, and lets drawing through.
                    coach.classList.toggle('inside', side === 'inside');
                    x = side === 'left' ? paper.left : side === 'right' ? paper.right : paper.left + 12;
                    y = steps.paper;
                    if (steps.softRing) {
                        const box = document.querySelector(steps.softRing)?.getBoundingClientRect();
                        if (box?.width) {
                            ring.className = 'guide-ring soft';
                            Object.assign(ring.style, { left: `${box.left - 3}px`, top: `${box.top - 3}px`, width: `${box.width + 6}px`, height: `${box.height + 6}px` });
                            ring.hidden = false;
                        }
                    }
                }
                let left = { left: x - gap - w, right: x + gap, top: x - 34, inside: x }[side];
                let topY = { left: y - h / 2, right: y - h / 2, top: y - gap - h, inside: y - h / 2 }[side];
                left = Math.max(8, Math.min(window.innerWidth - w - 8, left));
                topY = Math.max(60, Math.min(window.innerHeight - h - 8, topY));
                coach.style.left = `${Math.round(left)}px`;
                coach.style.top = `${Math.round(topY)}px`;
                const arrow = coach.querySelector('.guide-arrow');
                arrow.hidden = side === 'inside';
                if (side === 'left') Object.assign(arrow.style, { right: '-7px', top: `${y - topY - 7}px` });
                if (side === 'right') Object.assign(arrow.style, { left: '-7px', top: `${y - topY - 7}px` });
                if (side === 'top') Object.assign(arrow.style, { bottom: '-7px', left: `${x - left - 7}px` });
            }

            // The sample: a ball bouncing along the ground, moved by one Motion path.
            openSample() {
                this.guideStep = 0;
                this.renderGuide();
                // Like New, the sample replaces the animation, so warn first if it
                // isn't saved as a file (the welcome card shows the warning).
                if (this.hasUnsavedWork() && document.getElementById('welcome-modal')?.getAttribute('aria-hidden') !== 'false') {
                    this.showWelcome(false);
                    return;
                }
                this.closeModal('welcome-modal');
                this.writePref(GUIDE_KEY, 'done');
                this.confirmNewAnimation();
                const dot = (x, y, color, size) => ({ type: 'brush', brushType: 'brush', color, size, opacity: 1, points: [{ x, y, p: 0.5 }] });
                const line = (points, color, size) => ({ type: 'brush', brushType: 'brush', color, size, opacity: 1, points: points.map(([x, y]) => ({ x, y, p: 0.5 })) });
                const ground = () => [
                    line([[0, 524], [600, 524]], '#3b3b3b', 6),
                    ...[70, 190, 345, 470, 560].map((x) => line([[x - 8, 520], [x - 4, 508], [x, 520], [x + 4, 506], [x + 8, 520]], '#4f9a58', 4))
                ];
                this.frames = Array.from({ length: 12 }, (_, index) => ({ strokes: index === 0 ? [dot(70, 110, '#e74c3c', 56)] : [], paperStrokes: ground(), hold: 1 }));
                this.projectName = 'Bouncing ball';
                this.syncProjectNameUI();
                this.frameIndex = 0;
                this.renderUI();
                this.setTool('truck');
                const ball = this.frames[0].strokes[0];
                this.selectedObject = { stroke: ball, layer: 'ink', index: 0 };
                this.calcBounds(ball);
                this.startMotion();
                const track = this.motionTracks[0];
                // It lands on frames 4 and 10, and is at the top of a bounce on 7 and 12.
                [[3, 120, 386], [6, 235, 170], [9, 350, 386], [11, 440, 250]].forEach(([frame, dx, dy]) => this.setMotionTrackKeyframe(track, frame, { dx, dy }, false));
                track.keyframes.forEach((key) => { key.interpolation = key.frame === 6 || key.frame === 11 ? 'curved' : 'straight'; });
                this.applyMotionTrack(track);
                this.history = [];
                this.redoStack = [];
                this.selectFrame(4);
                this.hideMotionHint();
                this.updateThumbnails();
                this.renderCanvas();
                this.fileSaved = true;
                this.saveStorage(false);
                this.guideStep = 'sample';
                this.renderGuide();
            }

            // "Draw here" while the only frame is empty.
            updatePaperHint() {
                const hint = document.getElementById('paper-hint');
                if (!hint) return;
                const empty = this.frames.length === 1 && !this.frames[0].strokes.length && !this.getPaperStrokes(this.frames[0]).length && !this.backgroundImage && !this.isPlaying;
                if (hint.hidden === empty) hint.hidden = !empty;
            }

            // What's new: a dot on File until the latest notes are read.
            syncWhatsNew() {
                let seen = null;
                try { seen = localStorage.getItem('motionSketchWhatsNew'); } catch (e) { /* storage blocked */ }
                const fresh = seen !== WHATS_NEW_VERSION;
                document.getElementById('file-menu-toggle')?.classList.toggle('has-news', fresh);
                document.getElementById('whats-new-item')?.classList.toggle('has-news', fresh);
            }

            showWhatsNew() {
                try { localStorage.setItem('motionSketchWhatsNew', WHATS_NEW_VERSION); } catch (e) { /* storage blocked */ }
                this.syncWhatsNew();
                this.openModal('whats-new-modal', 'whats-new-close');
                // Focus goes to Got it at the bottom; start reading at the top.
                const box = document.querySelector('#whats-new-modal .modal-box');
                if (box) box.scrollTop = 0;
            }

            runExport(format) {
                this.setExportMenuOpen(false);
                if (format === 'gif' && this.frames.length > LONG_GIF_FRAME_THRESHOLD) {
                    this.showGifWarning();
                    return;
                }
                ({
                    gif: () => this.exportGIF(),
                    webm: () => this.exportWebM(),
                    png: () => this.exportFrame(),
                    'transparent-png': () => this.exportFrame(true),
                    svg: () => this.exportSVG(),
                    'png-sequence': () => this.exportPNGSequence()
                }[format])?.();
            }

            requestNewAnimation() {
                this.newDialogWarned = this.hasUnsavedWork();
                this.updateNewAnimationWarning();
                this.openModal('custom-modal', 'custom-modal');
            }

            // New replaces the only copy in this browser, so it says so when the
            // animation isn't saved as a file, and offers to save it first.
            updateNewAnimationWarning() {
                const warning = document.getElementById('new-unsaved');
                if (!warning) return;
                const unsaved = this.hasUnsavedWork();
                warning.hidden = !unsaved;
                const title = document.getElementById('new-unsaved-title');
                if (title) title.textContent = `“${this.projectName || 'Untitled'}” isn’t saved as a file yet.`;
                const saved = document.getElementById('new-saved');
                if (saved) saved.hidden = unsaved || !this.newDialogWarned;
            }
            closeModal(id) {
                if (id === 'settings-modal') {
                    this.backgroundImageRequest++;
                    this.backgroundImageDraft = null;
                    this.backgroundImageLoading = false;
                }
                const modal = document.getElementById(id || 'custom-modal');
                modal.style.display = 'none';
                modal.setAttribute('aria-hidden', 'true');
                if (id === 'text-modal') this.editingTextObject = null;
                this.modalReturnFocus?.focus();
                this.renderGuide();
            }
            confirmNewAnimation(width = 600, height = 600) {
                this.projectLoadRequest++;
                this.backgroundImageRequest++;
                this.backgroundImage = null;
                this.backgroundImageDraft = null;
                this.backgroundImageCache.clear();
                this.closeModal();
                this.frames = [{ strokes: [], paperStrokes: [], hold: 1 }];
                this.paperStrokes = [];
                this.motionTracks = [];
                this.truckSelectedTrackId = null;
                this.clearFrameSelection(false);
                this.frameIndex = 0;
                this.projectName = 'Untitled';
                this.resizeCanvas(width, height);
                this.selectedBgColor = '#ffffff';
                this.selectedObject = null;
                this.dragMode = null;
                this.history = [];
                this.redoStack = [];
                this.renderUI();
                this.syncProjectNameUI();
                this.renderCanvas();
                this.fileSaved = true;
                this.saveStorage(false);
            }

            groupSelection() {
                // Only works when a temporary multi-select (isGroup but NOT isPersistentGroup) is active
                if (!this.selectedObject || !this.selectedObject.isGroup || this.selectedObject.isPersistentGroup) return;
                if (this.motionDirectEditBlocked()) return;
                this.saveState();
                // A group is a structural artwork edit. Bake any animated copies
                // in this selection into their existing frames before regrouping,
                // so the old tracks cannot later regenerate duplicate objects.
                this.bakeMotionTracksForSelection();

                const list = this.getActiveStrokeList();

                // Collect all the individual strokes
                const itemStrokes = this.selectedObject.items.map(i => i.stroke);

                // Remove them from the layer
                itemStrokes.forEach(s => {
                    const idx = list.indexOf(s);
                    if (idx > -1) list.splice(idx, 1);
                });

                // Create persistent group object
                const groupStroke = {
                    type: 'group',
                    items: itemStrokes,
                    angle: 0
                };
                list.push(groupStroke);

                // Select the new group
                const bounds = this.getStrokeBounds(groupStroke);
                const items = itemStrokes.map((s, i) => ({ stroke: s, layer: this.activeLayer, index: i }));
                this.selectedObject = {
                    isGroup: true,
                    isPersistentGroup: true,
                    persistentGroupStroke: groupStroke,
                    items,
                    bounds,
                    angle: 0
                };

                this.renderCanvas();
                this.updateGroupToolbar();
                this.saveStorage();
                this.updateEditedThumbnails();
            }

            ungroupSelection() {
                // Only works on a persistent group selection
                if (!this.selectedObject || !this.selectedObject.isPersistentGroup) return;
                if (this.motionDirectEditBlocked()) return;
                this.saveState();
                this.bakeMotionTracksForSelection();

                const list = this.getActiveStrokeList();
                const grp = this.selectedObject.persistentGroupStroke;

                // Remove the group stroke
                const idx = list.indexOf(grp);
                if (idx > -1) list.splice(idx, 1);

                // Re-add each item individually
                grp.items.forEach(s => list.push(s));

                this.selectedObject = null;
                this.renderCanvas();
                this.updateGroupToolbar();
                this.saveStorage();
                this.updateEditedThumbnails();
            }

            updateGroupToolbar() {
                const toolbar = document.getElementById('group-toolbar');
                const btnGroup = document.getElementById('btn-group');
                const btnUngroup = document.getElementById('btn-ungroup');
                const label = document.getElementById('group-toolbar-label');
                if (!toolbar) return;

                if (!this.selectedObject || this.isPlaying) {
                    toolbar.classList.remove('visible');
                    return;
                }

                if (this.selectedObject.isPersistentGroup) {
                    // Show Ungroup only
                    toolbar.classList.add('visible');
                    btnGroup.style.display = 'none';
                    btnUngroup.style.display = '';
                    label.textContent = `Group (${this.selectedObject.items.length} objects)`;
                } else if (this.selectedObject.isGroup) {
                    // Show Group button for temporary multi-select
                    toolbar.classList.add('visible');
                    btnGroup.style.display = '';
                    btnUngroup.style.display = 'none';
                    label.textContent = `${this.selectedObject.items.length} selected`;
                } else {
                    // Single object — hide toolbar
                    toolbar.classList.remove('visible');
                }
                const showAlign = Boolean(this.selectedObject?.isGroup);
                document.getElementById('align-divider').style.display = showAlign ? '' : 'none';
                ['left', 'center', 'right', 'top', 'middle', 'bottom'].forEach((name) => document.getElementById(`btn-align-${name}`).style.display = showAlign ? '' : 'none');
            }

            alignSelection(mode) {
                if (!this.selectedObject?.isGroup) return;
                if (this.motionDirectEditBlocked()) return;
                this.saveState();
                const bounds = this.selectedObject.bounds;
                this.selectedObject.items.forEach((item) => {
                    const itemBounds = this.getStrokeBounds(item.stroke);
                    const targetX = mode === 'left' ? bounds.x : mode === 'center' ? bounds.x + (bounds.w - itemBounds.w) / 2 : mode === 'right' ? bounds.x + bounds.w - itemBounds.w : itemBounds.x;
                    const targetY = mode === 'top' ? bounds.y : mode === 'middle' ? bounds.y + (bounds.h - itemBounds.h) / 2 : mode === 'bottom' ? bounds.y + bounds.h - itemBounds.h : itemBounds.y;
                    const dx = targetX - itemBounds.x, dy = targetY - itemBounds.y;
                    if (item.stroke.type === 'text') { item.stroke.x += dx; item.stroke.y += dy; }
                    else item.stroke.points?.forEach((point) => { point.x += dx; point.y += dy; });
                    this.translateHoles(item.stroke, item.stroke.holes, dx, dy);
                });
                this.selectedObject.bounds = this.getGroupBounds(this.selectedObject.items);
                this.renderCanvas(); this.updateEditedThumbnails(); this.saveStorage();
            }

            deleteSelected() {
                if (!this.selectedObject) return;
                this.saveState();
                const list = this.getActiveStrokeList();

                const selectedTrack = this.getMotionTrackForSelection();
                if (selectedTrack) {
                    this.showExportNotice('Animated motion deleted', false);
                    this.motionTracks = this.motionTracks.filter((track) => track.id !== selectedTrack.id);
                    this.frames.forEach((frame) => { frame.strokes = frame.strokes.filter((stroke) => stroke.motionTrackId !== selectedTrack.id); });
                }

                if (selectedTrack) {
                    // The whole animated object is removed together so later frame edits
                    // cannot resurrect a deleted clone.
                } else if (this.selectedObject.isPersistentGroup) {
                    // Remove the single persistent group stroke
                    const idx = list.indexOf(this.selectedObject.persistentGroupStroke);
                    if (idx > -1) list.splice(idx, 1);
                } else if (this.selectedObject.isGroup) {
                    const itemsToRemove = new Set(this.selectedObject.items.map(i => i.stroke));
                    const frame = this.frames[this.frameIndex];
                    const key = this.activeLayer === 'ink' ? 'strokes' : 'paperStrokes';
                    frame[key] = frame[key].filter(s => !itemsToRemove.has(s));
                } else {
                    const idx = list.indexOf(this.selectedObject.stroke);
                    if (idx > -1) list.splice(idx, 1);
                }

                this.selectedObject = null;
                this.dragMode = null;
                this.renderCanvas();
                this.saveStorage();
                this.updateThumbnails(selectedTrack ? null : [this.frameIndex]);
                this.renderMotionTracks();
            }

            copySelection() {
                if (!this.selectedObject) return false;
                if (this.selectedObject.isPersistentGroup) {
                    this.clipboard = JSON.parse(JSON.stringify(this.selectedObject.persistentGroupStroke));
                } else if (this.selectedObject.isGroup) {
                    this.clipboard = { isGroup: true, items: JSON.parse(JSON.stringify(this.selectedObject.items)) };
                } else {
                    this.clipboard = JSON.parse(JSON.stringify(this.selectedObject.stroke));
                }
                this.lastCopiedContent = 'artwork';
                this.artworkClipboardSourceFrame = this.frames[this.frameIndex];
                return true;
            }

            pasteSelection() {
                if (!this.clipboard) return false;
                const offset = !this.artworkClipboardSourceFrame || this.artworkClipboardSourceFrame === this.frames[this.frameIndex] ? 20 : 0;
                {
                    this.saveState();
                    const list = this.getActiveStrokeList();

                    if (this.clipboard.type === 'group') {
                        // Paste persistent group as a new group stroke
                        const newGroup = JSON.parse(JSON.stringify(this.clipboard));
                        this.stripMotionMetadata(newGroup);
                        newGroup.items.forEach(item => {
                            if (item.type !== 'text') {
                                item.points.forEach(p => { p.x += offset; p.y += offset; });
                            } else {
                                item.x += offset; item.y += offset;
                            }
                            this.translateHoles(item, item.holes, offset, offset);
                        });
                        list.push(newGroup);
                        const bounds = this.getStrokeBounds(newGroup);
                        const items = newGroup.items.map((item, i) => ({ stroke: item, layer: this.activeLayer, index: i }));
                        this.selectedObject = {
                            isGroup: true,
                            isPersistentGroup: true,
                            persistentGroupStroke: newGroup,
                            items,
                            bounds,
                            angle: newGroup.angle || 0
                        };
                    } else if (this.clipboard.isGroup) {
                        const newItems = [];
                        this.clipboard.items.forEach(item => {
                            const newStroke = this.stripMotionMetadata(JSON.parse(JSON.stringify(item.stroke)));
                            if (newStroke.type !== 'text') {
                                newStroke.points.forEach(p => { p.x += offset; p.y += offset; });
                            } else {
                                newStroke.x += offset; newStroke.y += offset;
                            }
                            this.translateHoles(newStroke, newStroke.holes, offset, offset);
                            list.push(newStroke);
                            newItems.push({ stroke: newStroke, layer: this.activeLayer });
                        });
                        this.selectedObject = {
                            isGroup: true,
                            items: newItems,
                            bounds: this.getGroupBounds(newItems)
                        };
                    } else {
                        const newStroke = this.stripMotionMetadata(JSON.parse(JSON.stringify(this.clipboard)));
                        if (newStroke.type !== 'text') {
                            newStroke.points.forEach(p => { p.x += offset; p.y += offset; });
                        } else {
                            newStroke.x += offset; newStroke.y += offset;
                        }
                        this.translateHoles(newStroke, newStroke.holes, offset, offset);
                        list.push(newStroke);
                        this.selectedObject = { stroke: newStroke, layer: this.activeLayer };
                        this.calcBounds(newStroke);
                    }
                    this.renderCanvas();
                    this.saveStorage();
                    this.updateEditedThumbnails();
                }
                return true;
            }
        }

        function initApp() {
            const c = document.getElementById('rendering-canvas');
            if (!c) { setTimeout(initApp, 50); return; }
            window.app = new MotionSketchVector();
        }

        if (document.readyState === 'complete' || document.readyState === 'interactive') {
            initApp();
        } else {
            document.addEventListener('DOMContentLoaded', initApp);
        }
