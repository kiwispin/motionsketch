import '@fortawesome/fontawesome-free/css/all.css';
import gifshot from 'gifshot';
import JSZip from 'jszip';

window.gifshot = gifshot;

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
                this.sharedStrokes = [];
                this.frameIndex = 0;

                this.activeLayer = 'ink';
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

                this.selectedObject = null;
                this.selectedBgColor = '#ffffff';
                this.dragMode = null;
                this.snapToGrid = false;
                this.snapSize = 10;
                this.showGrid = false;
                this.symmetryEnabled = false;
                this.referenceImage = null;
                this.draggedFrameIndex = null;

                this.isSelectingBox = false;
                this.selectionStart = { x: 0, y: 0 };
                this.selectionCurr = { x: 0, y: 0 };

                this.isPlaying = false;
                this.loopMode = 'loop';
                this.playTimer = null;
                this.fps = 12;
                this.isOnion = false;
                this.onionFrames = 1;
                this.onionOpacity = 0.3;

                this.canvasWidth = 600;
                this.canvasHeight = 600;
                this.projectName = 'Untitled';
                this.zoom = 1.0;
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
                this.setupEvents();
                this.setupEditableNumbers();
                this.handleResize();
                window.addEventListener('resize', () => this.handleResize());
                this.resizeCanvas(this.canvasWidth, this.canvasHeight);

                await this.loadStorage();
                this.renderUI();
                this.renderPalette();
                this.updateCursorStyle();
                this.updateBrushPreview();
                this.updateInspector();
                this.syncOnionUI();
                this.registerServiceWorker();

                const picker = document.getElementById('html-color-picker');
                if (picker) picker.value = this.brushColor;
            }

            loadTheme() {
                const theme = localStorage.getItem('motionSketchTheme') || 'dark';
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
                localStorage.setItem('motionSketchTheme', next);
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

            handleResize() {
                const workspace = document.querySelector('.workspace');
                if (!workspace) return;

                const availW = workspace.clientWidth - 100;
                const availH = workspace.clientHeight - 100;
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
                if (this.showGrid) this.canvasWrapper.style.setProperty('--grid-size', `${this.snapSize * this.zoom}px`);
                this.updateBrushPreview();
            }

            setupEvents() {
                const c = this.canvas;
                const workspace = document.querySelector('.workspace');
                c.tabIndex = 0;

                workspace?.addEventListener('wheel', (e) => {
                    if (!e.ctrlKey && !e.metaKey) return;
                    e.preventDefault();
                    this.adjustZoom(e.deltaY < 0 ? 0.1 : -0.1, e);
                }, { passive: false });

                workspace?.addEventListener('pointerdown', (e) => {
                    if (e.button !== 1 && !this.isHandTool && !this.spacePanActive) return;
                    this.startPan(e, workspace);
                }, true);

                const start = (e) => this.onDown(this.getPos(e), e.pressure, e.ctrlKey || e.metaKey);
                const move = (e) => {
                    let p = e.pressure;
                    if (e.pointerType === 'mouse' && e.buttons === 1) p = 0.5;
                    this.onMove(this.getPos(e), p);
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
                    if (this.isDrawing || this.selectedObject || this.isSelectingBox) move(e);
                });

                c.addEventListener('pointerenter', () => { if (this.isDrawingTool()) this.cursorEl.style.display = 'block'; });
                c.addEventListener('pointerleave', () => { this.cursorEl.style.display = 'none'; });

                c.addEventListener('pointerdown', (e) => {
                    if (this.isHandTool || this.spacePanActive || e.button === 1) {
                        this.startPan(e, workspace);
                        return;
                    }
                    c.focus({ preventScroll: true });
                    c.setPointerCapture(e.pointerId);
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
                    const shapeWrapper = document.getElementById('shape-wrapper');
                    if (shapeWrapper && !shapeWrapper.contains(e.target)) this.setFlyoutExpanded('shape-wrapper', 'tool-shape-anchor', false);
                    const brushWrapper = document.getElementById('brush-wrapper');
                    if (brushWrapper && !brushWrapper.contains(e.target)) this.setFlyoutExpanded('brush-wrapper', 'tool-brush-anchor', false);
                    const exportWrapper = document.getElementById('export-menu-wrapper');
                    if (exportWrapper && !exportWrapper.contains(e.target)) this.setExportMenuOpen(false);
                });

                document.addEventListener('keydown', (e) => {
                    if (e.key === 'Escape') {
                        if (!document.getElementById('export-menu')?.hidden) {
                            e.preventDefault();
                            this.setExportMenuOpen(false, true);
                            return;
                        }
                        const openModal = [...document.querySelectorAll('.modal-overlay')].find((modal) => modal.style.display === 'flex');
                        if (openModal) {
                            e.preventDefault();
                            this.closeModal(openModal.id);
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

                    const key = (e.key || '').toLowerCase();
                    const hasCommandModifier = e.ctrlKey || e.metaKey;
                    const hasToolModifier = hasCommandModifier || e.altKey;

                    // Reserve modified keys for explicit editor commands. In particular,
                    // Ctrl/Cmd+V must never also select the Select tool.
                    if (hasCommandModifier) {
                        if (key === 'c' && this.copySelection()) {
                            e.preventDefault();
                            return;
                        }
                        if (key === 'v' && this.pasteSelection()) {
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

                    if (e.code === 'Space') {
                        e.preventDefault();
                        this.spacePanActive = true;
                        workspace?.classList.add('space-pan-active');
                        return;
                    }

                    if (e.key === 'Delete' || e.key === 'Backspace') {
                        if (this.selectedObject) {
                            e.preventDefault();
                            this.deleteSelected();
                        } else if (this.frames.length > 1) {
                            e.preventDefault();
                            this.deleteFrame();
                        }
                    }

                    if (key === 'd') this.duplicateFrame();
                    if (key === 'n') this.addFrame();
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

                mark.style.backgroundColor = color;
                mark.style.border = type === 'eraser' ? '1px solid rgba(0, 0, 0, 0.65)' : 'none';
                mark.style.boxShadow = type === 'pencil'
                    ? `0 0 0 1px ${this.hexToRgba(this.brushColor, Math.max(0.45, alpha))}`
                    : '0 0 0 1px rgba(255, 255, 255, 0.45), 0 0 0 2px rgba(0, 0, 0, 0.25)';

                if (type === 'highlighter') {
                    mark.style.width = brushPreview.previewWidth + 'px';
                    mark.style.height = brushPreview.previewHeight + 'px';
                    mark.style.borderRadius = '4px';
                } else if (type === 'pencil') {
                    mark.style.width = brushPreview.previewWidth + 'px';
                    mark.style.height = brushPreview.previewHeight + 'px';
                    mark.style.borderRadius = '2px';
                } else {
                    mark.style.width = brushPreview.previewWidth + 'px';
                    mark.style.height = brushPreview.previewHeight + 'px';
                    mark.style.borderRadius = '999px';
                }
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
                document.getElementById('canvas-width').value = this.canvasWidth;
                document.getElementById('canvas-height').value = this.canvasHeight;
                this.openModal('settings-modal', 'canvas-width');
            }

            openModal(id, focusId) {
                this.modalReturnFocus = document.activeElement;
                const modal = document.getElementById(id);
                modal.style.display = 'flex';
                modal.setAttribute('aria-hidden', 'false');
                document.getElementById(focusId)?.focus();
            }

            applySettings() {
                const { width, height } = this.normalizeCanvasSize(
                    document.getElementById('canvas-width').value,
                    document.getElementById('canvas-height').value
                );
                document.getElementById('canvas-width').value = width;
                document.getElementById('canvas-height').value = height;
                this.resizeCanvas(width, height);
                this.closeModal('settings-modal');
                this.saveStorage();
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

            normalizeFrames(frames, legacyPaperStrokes = []) {
                const sourceFrames = Array.isArray(frames) && frames.length ? frames : [{ strokes: [] }];
                return sourceFrames.map((frame, index) => {
                    const paperSource = Array.isArray(frame.paperStrokes)
                        ? frame.paperStrokes
                        : (index === 0 ? this.cloneData(legacyPaperStrokes || []) : []);
                    return {
                        ...frame,
                        hold: Math.max(1, Math.min(12, Number.parseInt(frame.hold, 10) || 1)),
                        strokes: this.materializeErasers(Array.isArray(frame.strokes) ? frame.strokes : []),
                        paperStrokes: this.materializeErasers(paperSource)
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
                const radius = Math.max(2, (eraserStroke.size || this.brushSize) / 2);
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
                if (!frame.paperStrokes) frame.paperStrokes = [];
                return frame.paperStrokes;
            }

            getActiveStrokeList() {
                const frame = this.frames[this.frameIndex];
                return this.activeLayer === 'ink' ? frame.strokes : this.sharedStrokes;
            }

            saveState() {
                if (this.history.length > 20) this.history.shift();
                this.redoStack = [];
                const state = {
                    frames: this.cloneData(this.frames),
                    sharedStrokes: this.cloneData(this.sharedStrokes),
                    frameIndex: this.frameIndex,
                    bgColor: this.selectedBgColor,
                    width: this.canvasWidth,
                    height: this.canvasHeight,
                    palette: this.palette
                };
                this.history.push(JSON.stringify(state));
            }

            undo() {
                if (this.history.length === 0) return false;
                const currentState = {
                    frames: this.cloneData(this.frames),
                    sharedStrokes: this.cloneData(this.sharedStrokes),
                    frameIndex: this.frameIndex,
                    bgColor: this.selectedBgColor,
                    width: this.canvasWidth,
                    height: this.canvasHeight,
                    palette: this.palette
                };
                this.redoStack.push(JSON.stringify(currentState));
                const prevState = JSON.parse(this.history.pop());
                this.frames = this.normalizeFrames(prevState.frames, prevState.paperStrokes);
                this.sharedStrokes = this.materializeErasers(prevState.sharedStrokes || []);
                this.frameIndex = prevState.frameIndex;
                this.selectedBgColor = prevState.bgColor;
                if (prevState.palette) { this.palette = prevState.palette; this.renderPalette(); }
                if (prevState.width && prevState.height) this.resizeCanvas(prevState.width, prevState.height);
                this.selectedObject = null;
                this.updateThumbnails();
                this.renderCanvas();
                this.renderUI(true);
                this.saveStorage();
                return true;
            }

            redo() {
                if (this.redoStack.length === 0) return false;
                const currentState = {
                    frames: this.cloneData(this.frames),
                    sharedStrokes: this.cloneData(this.sharedStrokes),
                    frameIndex: this.frameIndex,
                    bgColor: this.selectedBgColor,
                    width: this.canvasWidth,
                    height: this.canvasHeight,
                    palette: this.palette
                };
                this.history.push(JSON.stringify(currentState));
                const nextState = JSON.parse(this.redoStack.pop());
                this.frames = this.normalizeFrames(nextState.frames, nextState.paperStrokes);
                this.sharedStrokes = this.materializeErasers(nextState.sharedStrokes || []);
                this.frameIndex = nextState.frameIndex;
                this.selectedBgColor = nextState.bgColor;
                if (nextState.palette) { this.palette = nextState.palette; this.renderPalette(); }
                if (nextState.width && nextState.height) this.resizeCanvas(nextState.width, nextState.height);
                this.selectedObject = null;
                this.updateThumbnails();
                this.renderCanvas();
                this.renderUI(true);
                this.saveStorage();
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

                if (this.tool === 'bucket') {
                    this.saveState();
                    const found = this.hitTest(pos);
                    if (found) {
                        found.stroke.fillColor = this.brushColor;
                        if (found.stroke.type === 'text') found.stroke.color = this.brushColor;
                        this.renderCanvas();
                    } else {
                        const list = this.getActiveStrokeList();
                        list.unshift({
                            type: 'rect',
                            brushType: 'brush',
                            color: this.brushColor,
                            size: 2,
                            opacity: 1,
                            points: [
                                { x: 0, y: 0, p: 0.5 },
                                { x: this.canvasWidth, y: 0, p: 0.5 },
                                { x: this.canvasWidth, y: this.canvasHeight, p: 0.5 },
                                { x: 0, y: this.canvasHeight, p: 0.5 },
                                { x: 0, y: 0, p: 0.5 }
                            ],
                            fillColor: this.brushColor,
                            holes: [],
                            sx: 1, sy: 1,
                            angle: 0
                        });
                        this.updateThumbnails();
                        this.renderCanvas();
                    }
                    this.saveStorage();
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
                                    if (item.stroke.type === 'text') return { x: item.stroke.x, y: item.stroke.y, w: item.stroke.width, h: item.stroke.height, angle: item.stroke.angle || 0 };
                                    return { points: item.stroke.points.map(p => ({ ...p })), angle: item.stroke.angle || 0 };
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
                            } else {
                                this.dragOriginalPoints = this.selectedObject.stroke.points.map(p => ({ ...p }));
                                this.dragOriginalAngle = this.selectedObject.stroke.angle || 0;
                                this.dragOriginalBounds = { ...this.selectedObject.bounds };
                                this.dragCenter = { x: this.selectedObject.bounds.x + this.selectedObject.bounds.w / 2, y: this.selectedObject.bounds.y + this.selectedObject.bounds.h / 2 };
                            }
                            return;
                        }

                        if (this.isInBounds(pos, this.selectedObject.bounds)) {
                            this.saveState();
                            this.dragMode = 'move';
                            this.dragStart = pos;
                            this.dragOriginalBounds = { ...this.selectedObject.bounds };

                            if (this.selectedObject.isGroup) {
                                this.dragOriginalItems = this.selectedObject.items.map(item => {
                                    if (item.stroke.type === 'text') return { x: item.stroke.x, y: item.stroke.y };
                                    return { points: item.stroke.points.map(p => ({ ...p })) };
                                });
                            } else if (this.selectedObject.stroke.type === 'text') {
                                this.dragOriginalProps = { x: this.selectedObject.stroke.x, y: this.selectedObject.stroke.y };
                            } else {
                                this.dragOriginalPoints = this.selectedObject.stroke.points.map(p => ({ ...p }));
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
                                if (item.stroke.type === 'text') return { x: item.stroke.x, y: item.stroke.y, w: item.stroke.width, h: item.stroke.height, angle: item.stroke.angle || 0 };
                                return { points: item.stroke.points.map(p => ({ ...p })), angle: item.stroke.angle || 0 };
                            });
                        } else {
                            this.selectedObject = found;
                            this.calcBounds(found.stroke);
                            this.dragOriginalBounds = { ...this.selectedObject.bounds };
                            if (found.stroke.type === 'text') {
                                this.dragOriginalProps = { x: found.stroke.x, y: found.stroke.y };
                            } else {
                                this.dragOriginalPoints = found.stroke.points.map(p => ({ ...p }));
                            }
                        }
                        this.dragMode = 'move';
                        this.dragStart = pos;
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
                                    }
                                });
                                this.selectedObject.bounds = { x: newX, y: newY, w: newW, h: newH };
                            }
                            this.renderCanvas();
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
                        } else if (this.dragMode === 'rotate') {
                            const startAngle = Math.atan2(this.dragStart.y - this.dragCenter.y, this.dragStart.x - this.dragCenter.x);
                            const currAngle = Math.atan2(pos.y - this.dragCenter.y, pos.x - this.dragCenter.x);
                            const angleDiff = currAngle - startAngle;

                            if (stroke.type === 'text') {
                                stroke.angle = (this.dragOriginalProps.angle || 0) + angleDiff;
                            } else {
                                stroke.angle = (this.dragOriginalAngle || 0) + angleDiff;
                            }
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
                                stroke.sx = newW / this.dragOriginalBounds.w;
                                stroke.sy = newH / this.dragOriginalBounds.h;
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
                            }
                        }
                        this.calcBounds(this.selectedObject.stroke);
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

            onUp() {
                if (this.isSelectingBox) {
                    this.isSelectingBox = false;

                    const x1 = Math.min(this.selectionStart.x, this.selectionCurr.x);
                    const y1 = Math.min(this.selectionStart.y, this.selectionCurr.y);
                    const x2 = Math.max(this.selectionStart.x, this.selectionCurr.x);
                    const y2 = Math.max(this.selectionStart.y, this.selectionCurr.y);
                    const selBox = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };

                    if (selBox.w > 2 || selBox.h > 2) {
                        const items = [];
                        const list = this.getActiveStrokeList();

                        list.forEach((stroke, i) => {
                            const b = this.getStrokeBounds(stroke);
                            if (this.rectIntersect(selBox, b)) {
                                items.push({ stroke, layer: this.activeLayer, index: i });
                            }
                        });

                        if (items.length === 1) {
                            this.selectedObject = items[0];
                            this.calcBounds(items[0].stroke);
                        } else if (items.length > 1) {
                            this.selectedObject = {
                                isGroup: true,
                                items: items,
                                bounds: this.getGroupBounds(items),
                                angle: 0
                            };
                        }
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
                    this.updateThumbnails();
                    this.saveStorage();
                }
                if (this.dragMode) {
                    this.dragMode = null;
                    this.updateThumbnails();
                    this.saveStorage();
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
                const radius = Math.max(2, this.brushSize / 2);
                const next = [];
                let changed = false;

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

            eraseStrokeWithSegment(stroke, from, to, radius) {
                if (!stroke) return [];

                if (stroke.type === 'group') {
                    const keptItems = [];
                    stroke.items.forEach(item => {
                        this.eraseStrokeWithSegment(item, from, to, radius).forEach(piece => keptItems.push(piece));
                    });
                    if (!keptItems.length) return [];
                    if (keptItems.length === stroke.items.length && keptItems.every((item, index) => item === stroke.items[index])) return [stroke];
                    const nextGroup = this.cloneData(stroke);
                    nextGroup.items = keptItems;
                    return [nextGroup];
                }

                if (stroke.type === 'text') {
                    return this.eraserIntersectsBounds(this.getStrokeBounds(stroke), from, to, radius) ? [] : [stroke];
                }

                if (!stroke.points || !stroke.points.length) return [stroke];

                const brushRadius = Math.max(1, this.getSinglePointDiameter(stroke) / 2);
                const hitRadius = radius + brushRadius;

                if (stroke.fillColor) {
                    const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
                    if (this.strokeIntersectsEraser(stroke, from, to, hitRadius) ||
                        this.containsPoint(stroke.points, mid) ||
                        this.containsPoint(stroke.points, from)) {
                        const next = this.cloneData(stroke);
                        if (!next.holes) next.holes = [];
                        next.holes.push(this.buildEraserHole(from, to, radius));
                        return [next];
                    }
                    return [stroke];
                }

                if (stroke.points.length === 1) {
                    const p = stroke.points[0];
                    return this.distToSegment(p, from, to) <= hitRadius ? [] : [stroke];
                }

                const chunks = [];
                let current = [];
                for (let i = 0; i < stroke.points.length - 1; i++) {
                    const p1 = stroke.points[i];
                    const p2 = stroke.points[i + 1];
                    const erased = this.segmentsNear(p1, p2, from, to, hitRadius);

                    if (erased) {
                        if (current.length > 1) chunks.push(current);
                        current = [];
                    } else {
                        if (!current.length) current.push({ ...p1 });
                        current.push({ ...p2 });
                    }
                }

                if (current.length > 1) chunks.push(current);
                if (chunks.length === 1 && chunks[0].length === stroke.points.length) return [stroke];

                return chunks.map(points => ({
                    ...this.cloneData(stroke),
                    points,
                    fillColor: null
                }));
            }

            strokeIntersectsEraser(stroke, from, to, radius) {
                if (!stroke.points || !stroke.points.length) return false;
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

            punchHoles(ctx, stroke) {
                if (!stroke.holes || !stroke.holes.length) return;
                const prevOp = ctx.globalCompositeOperation;
                ctx.globalCompositeOperation = 'destination-out';
                ctx.fillStyle = 'rgba(0,0,0,1)';
                stroke.holes.forEach(hole => {
                    ctx.beginPath();
                    ctx.moveTo(hole[0].x, hole[0].y);
                    for (let i = 1; i < hole.length; i++) ctx.lineTo(hole[i].x, hole[i].y);
                    ctx.closePath();
                    ctx.fill();
                });
                ctx.globalCompositeOperation = prevOp;
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
                if (this.activeLayer === 'ink') return checkList(this.frames[this.frameIndex].strokes, 'ink');
                return checkList(this.sharedStrokes, 'shared');
            }

            strokeHit(stroke, pos) {
                if (!stroke.points || stroke.points.length === 0) return false;
                const hitThresh = Math.max(10, stroke.size);

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

                if (stroke.points.length === 1) {
                    const p = stroke.points[0];
                    const dist = Math.hypot(checkPos.x - p.x, checkPos.y - p.y);
                    const sx = stroke.sx || 1;
                    const sy = stroke.sy || 1;
                    const maxDim = Math.max(sx, sy) * (this.getSinglePointDiameter(stroke) / 2);
                    return dist < maxDim + 10;
                }

                let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
                stroke.points.forEach(p => { if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x; if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y; });
                if (checkPos.x < minX - hitThresh || checkPos.x > maxX + hitThresh || checkPos.y < minY - hitThresh || checkPos.y > maxY + hitThresh) return false;

                for (let i = 0; i < stroke.points.length - 1; i++) {
                    if (this.distToSegment(checkPos, stroke.points[i], stroke.points[i + 1]) < hitThresh) return true;
                }

                if (this.tool === 'bucket' || stroke.fillColor) {
                    if (this.containsPoint(stroke.points, checkPos)) return true;
                }
                return false;
            }

            containsPoint(points, pos) {
                let inside = false;
                for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
                    const xi = points[i].x, yi = points[i].y;
                    const xj = points[j].x, yj = points[j].y;
                    const intersect = ((yi > pos.y) !== (yj > pos.y)) && (pos.x < (xj - xi) * (pos.y - yi) / (yj - yi) + xi);
                    if (intersect) inside = !inside;
                }
                return inside;
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
                    const sx = stroke.sx || 1;
                    const sy = stroke.sy || 1;
                    const p = stroke.points[0];
                    const w = s * sx;
                    const h = s * sy;
                    return { x: p.x - w / 2, y: p.y - h / 2, w: w, h: h };
                } else {
                    if (stroke.points.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
                    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                    stroke.points.forEach(p => {
                        if (p.x < minX) minX = p.x;
                        if (p.x > maxX) maxX = p.x;
                        if (p.y < minY) minY = p.y;
                        if (p.y > maxY) maxY = p.y;
                    });
                    const pad = stroke.size / 2;
                    return { x: minX - pad, y: minY - pad, w: (maxX - minX) + pad * 2, h: (maxY - minY) + pad * 2 };
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
                if (this.referenceImage?.complete) { bgCtx.save(); bgCtx.globalAlpha = 0.35; const scale = Math.min(this.canvasWidth / this.referenceImage.width, this.canvasHeight / this.referenceImage.height); const width = this.referenceImage.width * scale, height = this.referenceImage.height * scale; bgCtx.drawImage(this.referenceImage, (this.canvasWidth - width) / 2, (this.canvasHeight - height) / 2, width, height); bgCtx.restore(); }
                bgCtx.globalAlpha = 1.0;
                this.sharedStrokes.forEach(s => this.drawObject(bgCtx, s, false, 'shared'));
                this.getPaperStrokes().forEach(s => this.drawObject(bgCtx, s, false, 'paper'));
                this.currentRenderBgColor = null;

                ctx.globalCompositeOperation = 'source-over';
                ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
                ctx.globalAlpha = 1.0;
                this.frames[this.frameIndex].strokes.forEach(s => this.drawObject(ctx, s, false, 'ink'));

                if (this.isOnion && this.frameIndex > 0 && !this.isPlaying) {
                    for (let offset = 1; offset <= this.onionFrames; offset++) {
                        const previousFrame = this.frames[this.frameIndex - offset];
                        if (!previousFrame) break;
                        ctx.globalAlpha = this.onionOpacity * (1 - ((offset - 1) * 0.25));
                        previousFrame.strokes.forEach(s => this.drawObject(ctx, s, true, 'ink'));
                    }
                    ctx.globalAlpha = 1.0;
                }

                if (this.selectedObject && !this.isPlaying) {
                    const list = this.getActiveStrokeList();

                    if (this.selectedObject.isGroup) {
                        this.drawSelectionUI(ctx);
                    } else if (list.includes(this.selectedObject.stroke)) {
                        this.drawSelectionUI(ctx);
                    } else {
                        this.selectedObject = null;
                    }
                }

                if (this.isSelectingBox) {
                    ctx.save();
                    ctx.strokeStyle = '#0A84FF';
                    ctx.lineWidth = 1;
                    ctx.setLineDash([5, 5]);
                    const x = Math.min(this.selectionStart.x, this.selectionCurr.x);
                    const y = Math.min(this.selectionStart.y, this.selectionCurr.y);
                    const w = Math.abs(this.selectionCurr.x - this.selectionStart.x);
                    const h = Math.abs(this.selectionCurr.y - this.selectionStart.y);
                    ctx.strokeRect(x, y, w, h);
                    ctx.fillStyle = 'rgba(10, 132, 255, 0.1)';
                    ctx.fillRect(x, y, w, h);
                    ctx.restore();
                }

                // Update floating group toolbar
                this.updateGroupToolbar();
            }

            scheduleRender() {
                if (this.renderQueued) return;
                this.renderQueued = true;
                requestAnimationFrame(() => {
                    this.renderQueued = false;
                    this.renderCanvas();
                });
            }

            drawObject(ctx, obj, simpleMode = false, layerName = 'ink') {
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
                    obj.items.forEach(item => this.drawObject(ctx, item, simpleMode, layerName));
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
                        this.drawObject(ctx, this.getMirroredStroke(obj), simpleMode, layerName);
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
                        this.punchHoles(ctx, stroke);
                        return;
                    }

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

                    ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
                    for (let i = 1; i < stroke.points.length; i++) {
                        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
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
                    this.punchHoles(ctx, stroke);
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
                    this.punchHoles(ctx, stroke);
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
                this.punchHoles(ctx, stroke);
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
                const btn = document.getElementById('bg-color-picker');
                const input = document.getElementById('bg-color-input');
                const label = document.getElementById('bg-color-label');
                if (!btn || !input || !label) return;
                const textColor = this.getContrastTextColor(color);
                btn.style.background = color;
                btn.style.color = textColor;
                input.value = color;
                label.style.textShadow = 'none';
            }

            setTool(t) {
                if (this.isHandTool) this.setHandTool(false);
                this.clearQuickLineTimer();
                this.quickLineActive = false;
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
                this.selectedObject = null;
                this.updateInspector();
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
                this.activeLayer = l;
                document.getElementById('layer-ink').classList.toggle('active', l === 'ink');
                document.getElementById('layer-paper').classList.toggle('active', l === 'shared');
                document.getElementById('layer-ink').setAttribute('aria-pressed', String(l === 'ink'));
                document.getElementById('layer-paper').setAttribute('aria-pressed', String(l === 'shared'));
                this.selectedObject = null;
                this.updateInspector();
                this.renderCanvas();
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

            updateInspector() {
                const title = document.getElementById('inspector-title');
                const description = document.getElementById('inspector-description');
                if (!title || !description) return;
                if (this.selectedObject) {
                    const selectedType = this.selectedObject.isGroup ? 'Multiple objects' : (this.selectedObject.stroke?.type || 'Object');
                    title.textContent = selectedType === 'Multiple objects' ? selectedType : `${selectedType[0].toUpperCase()}${selectedType.slice(1)} selected`;
                    description.textContent = 'Use the canvas handles to move, resize, rotate, or edit the selected object.';
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
                    select: ['Select', 'Click an object to move, resize, rotate, or edit it.']
                };
                const [toolTitle, toolDescription] = this.isHandTool ? labels.hand : (labels[this.tool] || labels.brush);
                title.textContent = toolTitle;
                description.textContent = `${toolDescription} Active layer: ${this.activeLayer === 'ink' ? 'Foreground' : 'Background'}.`;
            }

            setColor(c) {
                this.brushColor = c;
                document.getElementById('html-color-picker').value = c;
                if (this.selectedObject) {
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
                    this.renderCanvas();
                    this.saveStorage();
                }
                this.updateCursorStyle();
            }

            updateBgColor(color) {
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
                    this.saveState();
                    if (this.selectedObject.isGroup) {
                        this.selectedObject.items.forEach(item => { item.stroke.size = this.brushSize; });
                        this.selectedObject.bounds = this.getGroupBounds(this.selectedObject.items);
                    } else {
                        this.selectedObject.stroke.size = this.brushSize;
                        this.calcBounds(this.selectedObject.stroke);
                    }
                    this.renderCanvas();
                    this.saveStorage();
                }
                this.updateCursorStyle();
            }

            setOpacity(v) {
                this.opacity = parseInt(v) / 100;
                document.getElementById('op-disp').innerText = v;
                if (this.selectedObject) {
                    this.saveState();
                    if (this.selectedObject.isGroup) {
                        this.selectedObject.items.forEach(item => { item.stroke.opacity = this.opacity; });
                    } else {
                        this.selectedObject.stroke.opacity = this.opacity;
                    }
                    this.renderCanvas();
                    this.saveStorage();
                }
                this.updateCursorStyle();
            }

            toggleOnion() {
                this.isOnion = !this.isOnion;
                document.getElementById('onion-btn').classList.toggle('active', this.isOnion);
                document.getElementById('onion-btn').setAttribute('aria-pressed', String(this.isOnion));
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
                const opacity = document.getElementById('onion-opacity');
                const countDisplay = document.getElementById('onion-count-disp');
                const opacityDisplay = document.getElementById('onion-opacity-disp');
                if (count) count.value = this.onionFrames;
                if (opacity) opacity.value = Math.round(this.onionOpacity * 100);
                if (countDisplay) countDisplay.textContent = this.onionFrames;
                if (opacityDisplay) opacityDisplay.textContent = `${Math.round(this.onionOpacity * 100)}%`;
                [count, opacity].forEach((control) => {
                    if (control) control.disabled = !this.isOnion;
                });
            }

            rewind() {
                this.selectFrame(0);
            }

            getFrameHold(frame = this.frames[this.frameIndex]) {
                return Math.max(1, Math.min(12, Number.parseInt(frame?.hold, 10) || 1));
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

            selectFrame(index) {
                const nextIndex = Math.max(0, Math.min(this.frames.length - 1, index));
                if (nextIndex === this.frameIndex) {
                    this.syncFramePosition();
                    return false;
                }
                this.frameIndex = nextIndex;
                this.selectedObject = null;
                this.renderCanvas();
                this.renderUI(true);
                return true;
            }

            previousFrame() {
                return this.selectFrame(this.frameIndex - 1);
            }

            nextFrame() {
                return this.selectFrame(this.frameIndex + 1);
            }

            addFrame() {
                this.saveState();
                this.selectedObject = null;
                this.frames.splice(this.frameIndex + 1, 0, { strokes: [], paperStrokes: [], hold: 1 });
                this.frameIndex++;
                this.renderUI();
                this.renderCanvas();
                this.saveStorage();
                setTimeout(() => {
                    const addBtn = this.framesList.querySelector('.add-frame-btn');
                    if (addBtn) addBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
                }, 50);
            }

            duplicateFrame(index) {
                this.saveState();
                this.selectedObject = null;
                const target = index !== undefined ? index : this.frameIndex;
                const sourceFrame = this.frames[target];
                this.frames.splice(target + 1, 0, {
                    strokes: this.cloneData(sourceFrame.strokes),
                    paperStrokes: this.cloneData(this.getPaperStrokes(sourceFrame)),
                    frameBgColor: sourceFrame.frameBgColor,
                    hold: this.getFrameHold(sourceFrame)
                });
                this.frameIndex = target + 1;
                this.renderUI();
                this.renderCanvas();
                this.saveStorage();
            }

            deleteFrame(index) {
                this.saveState();
                this.selectedObject = null;
                const targetIndex = (index !== undefined) ? index : this.frameIndex;
                if (this.frames.length <= 1) {
                    this.frames[0].strokes = [];
                    this.frames[0].paperStrokes = [];
                    this.renderCanvas();
                } else {
                    this.frames.splice(targetIndex, 1);
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
                return document.querySelector('input[type="range"][oninput*="setFps"]');
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
                if (display) display.innerText = fps + ' FPS';
            }

            setFps(val) {
                this.fps = this.normalizeFps(val);
                this.syncFpsUI();
                if (this.isPlaying) { this.togglePlay(); this.togglePlay(); }
                this.saveStorage();
            }

            renderUI(minimal = false) {
                if (!minimal) {
                    this.framesList.innerHTML = '';
                    this.frames.forEach((f, i) => {
                        const el = document.createElement('div');
                        el.className = `frame-card ${i === this.frameIndex ? 'active' : ''}`;
                        el.onclick = () => {
                            this.selectFrame(i);
                        };

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
                    const addBtn = document.createElement('div');
                    addBtn.className = 'add-frame-btn';
                    addBtn.innerHTML = '+';
                    addBtn.onclick = () => this.addFrame();
                    this.framesList.appendChild(addBtn);
                    this.updateThumbnails();
                } else {
                    const cards = this.framesList.querySelectorAll('.frame-card');
                    cards.forEach((c, i) => {
                        if (i === this.frameIndex) {
                            c.classList.add('active');
                            c.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                        } else {
                            c.classList.remove('active');
                        }
                    });
                }
                this.syncFramePosition();
                this.syncTimelineSettings();
            }

            syncTimelineSettings() {
                const hold = this.getFrameHold();
                const holdControl = document.getElementById('frame-hold');
                const holdDisplay = document.getElementById('frame-hold-disp');
                const loopButton = document.getElementById('loop-mode-btn');
                if (holdControl) holdControl.value = hold;
                if (holdDisplay) holdDisplay.textContent = `${hold}f`;
                if (loopButton) {
                    const isLoop = this.loopMode === 'loop';
                    loopButton.textContent = isLoop ? 'Loop' : 'Once';
                    loopButton.setAttribute('aria-label', `Playback mode: ${isLoop ? 'loop' : 'once'}`);
                    loopButton.setAttribute('aria-pressed', String(isLoop));
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

            handleDragStart(e, index) { this.draggedFrameIndex = index; e.dataTransfer.effectAllowed = 'move'; e.currentTarget.style.opacity = '0.5'; }
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
                }
                targetCtx.globalAlpha = 1.0;
                this.sharedStrokes.forEach(s => this.drawObject(targetCtx, s, false, 'shared'));
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

            updateThumbnails() {
                const tCanvas = document.createElement('canvas');
                tCanvas.width = 120; tCanvas.height = 120;
                const tCtx = tCanvas.getContext('2d');
                const scale = 120 / this.canvasWidth;
                tCtx.scale(scale, scale);

                this.frames.forEach((f, i) => {
                    this.renderFrameToContext(tCtx, f);
                    f.thumb = tCanvas.toDataURL();
                });

                const imgs = this.framesList.querySelectorAll('.frame-card img');
                imgs.forEach((img, i) => { if (this.frames[i]) img.src = this.frames[i].thumb; });
            }

            saveStorage() {
                if (this.saveTimer) clearTimeout(this.saveTimer);
                this.saveTimer = setTimeout(() => {
                    const data = {
                        version: 5,
                        name: this.projectName,
                        frames: this.frames,
                        sharedStrokes: this.sharedStrokes,
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

                        const bar = document.getElementById('storage-bar');
                        if (bar) {
                            bar.style.width = pct + '%';
                            if (pct > 90) bar.style.background = '#ff3b30';
                            else if (pct > 70) bar.style.background = '#f1c40f';
                            else bar.style.background = '#2ecc71';
                        }
                        this.db.set('currentProject', jsonStr).then(() => {
                            const ind = document.getElementById('save-indicator');
                            ind.innerHTML = '<i class="fas fa-check"></i> Saved';
                            ind.style.background = 'rgba(46, 204, 113, 0.9)';
                            ind.style.opacity = 1;
                            setTimeout(() => ind.style.opacity = 0, 1500);
                        }).catch(e => console.log("IDB Error", e));
                    } catch (e) { console.log("Serialization Error", e); }
                }, 1000);
            }

            syncProjectNameUI() {
                const input = document.getElementById('project-name');
                if (input) input.value = this.projectName || 'Untitled';
            }

            async loadStorage() {
                try {
                    const jsonStr = await this.db.get('currentProject');
                    if (jsonStr) {
                        const data = JSON.parse(jsonStr);
                        if (data.version >= 2) {
                            this.frames = this.normalizeFrames(data.frames, data.paperStrokes);
                            this.sharedStrokes = this.materializeErasers(data.sharedStrokes || []);
                            this.fps = this.normalizeFps(data.fps);
                            this.syncFpsUI();
                            this.frameIndex = 0;
                            this.projectName = typeof data.name === 'string' && data.name.trim() ? data.name : 'Untitled';
                            if (data.width && data.height) this.resizeCanvas(data.width, data.height);
                            if (data.palette) { this.palette = data.palette; this.renderPalette(); }
                            this.renderUI();
                            this.syncProjectNameUI();
                            this.renderCanvas();
                        }
                    }
                } catch (e) { console.log('Error loading', e); }
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
                a.download = `sketchmotion-frame-${frameNumber}${transparent ? '-transparent' : ''}.png`;
                a.click();
                this.showExportNotice(`${transparent ? 'Transparent ' : ''}frame ${frameNumber} exported`);
            }

            exportSVG() {
                const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);
                const render = (object) => {
                    if (object.type === 'group') return object.items.map(render).join('');
                    const points = object.points || [];
                    const opacity = object.opacity ?? 1;
                    const style = `stroke="${object.color || '#000'}" stroke-opacity="${opacity}" fill="${object.fillColor || 'none'}" fill-opacity="${opacity}" stroke-width="${object.size || 1}" stroke-linecap="round" stroke-linejoin="round"`;
                    if (object.type === 'text') return `<text x="${object.x}" y="${object.y}" fill="${object.color}" fill-opacity="${opacity}" font-family="sans-serif" font-size="${object.size}">${escape(object.text)}</text>`;
                    if (!points.length) return '';
                    const path = points.map((point) => `${point.x},${point.y}`).join(' ');
                    if (object.fillColor && object.holes && object.holes.length) {
                        const holes = object.holes.map(hole => ' ' + hole.map((point) => `${point.x},${point.y}`).join(' ')).join('');
                        const output = `<polygon points="${path}${holes}" fill="${object.fillColor}" fill-opacity="${opacity}" fill-rule="evenodd" stroke="${object.color || '#000'}" stroke-opacity="${opacity}" stroke-width="${object.size || 1}" stroke-linejoin="round"/>`;
                        return object.symmetric && object.type === 'brush' ? output + render(this.getMirroredStroke(object)) : output;
                    }
                    if (object.type === 'circle' && points.length > 1) { const [a, b] = points; const radius = Math.hypot(b.x - a.x, b.y - a.y); return `<circle cx="${a.x}" cy="${a.y}" r="${radius}" ${style}/>`; }
                    if (object.type === 'rect' && points.length > 1) { const [a, b] = points; return `<rect x="${Math.min(a.x,b.x)}" y="${Math.min(a.y,b.y)}" width="${Math.abs(b.x-a.x)}" height="${Math.abs(b.y-a.y)}" ${style}/>`; }
                    const output = `<polyline points="${path}" ${style}/>`;
                    return object.symmetric && object.type === 'brush' ? output + render(this.getMirroredStroke(object)) : output;
                };
                const frame = this.frames[this.frameIndex];
                const background = frame.frameBgColor || this.selectedBgColor;
                const content = [...this.sharedStrokes, ...this.getPaperStrokes(frame), ...frame.strokes].map(render).join('');
                const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${this.canvasWidth}" height="${this.canvasHeight}" viewBox="0 0 ${this.canvasWidth} ${this.canvasHeight}"><rect width="100%" height="100%" fill="${background}"/>${content}</svg>`;
                const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
                const link = document.createElement('a'); link.href = url; link.download = `sketchmotion-frame-${String(this.frameIndex + 1).padStart(3, '0')}.svg`; link.click(); URL.revokeObjectURL(url);
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
                    this.setExportProgress(`Preparing frame 1 of ${total}…`);
                    for (let index = 0; index < total; index++) {
                        this.renderFrameToContext(tCtx, this.frames[index]);
                        const image = await new Promise((resolve) => tempC.toBlob(resolve, 'image/png'));
                        if (!image) throw new Error('PNG encoding failed');
                        zip.file(`sketchmotion-frame-${String(index + 1).padStart(3, '0')}.png`, image);
                        this.setExportProgress(`Preparing frame ${index + 1} of ${total}…`);
                    }

                    this.setExportProgress('Packing PNG sequence…');
                    const archive = await zip.generateAsync({ type: 'blob' });
                    const url = URL.createObjectURL(archive);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = 'sketchmotion-png-sequence.zip';
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

            async exportWebM() {
                if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) {
                    this.showExportNotice('Video export is unavailable in this browser', true);
                    return;
                }

                const tempC = document.createElement('canvas');
                tempC.width = this.canvasWidth;
                tempC.height = this.canvasHeight;
                const tCtx = tempC.getContext('2d');
                const stream = tempC.captureStream(this.fps);
                const preferredType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
                    .find((type) => MediaRecorder.isTypeSupported(type));
                const recorder = new MediaRecorder(stream, preferredType ? { mimeType: preferredType } : undefined);
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
                    recorder.stop();
                    await completed;
                    stream.getTracks().forEach((track) => track.stop());

                    const url = URL.createObjectURL(new Blob(chunks, { type: recorder.mimeType || 'video/webm' }));
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = 'sketchmotion-animation.webm';
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
                indicator.style.background = isError ? 'rgba(255, 59, 48, 0.92)' : 'rgba(46, 204, 113, 0.9)';
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
                            a.download = 'sketchmotion.gif';
                            a.click();
                            this.showExportNotice('Animated GIF exported');
                        } else {
                            this.showExportNotice('GIF export failed. Try a smaller canvas.', true);
                        }
                    });
                }, 30);
            }

            saveProject() {
                const data = {
                    version: 5,
                    name: this.projectName,
                    frames: this.frames.map(f => ({
                        strokes: f.strokes,
                        paperStrokes: this.getPaperStrokes(f),
                        frameBgColor: f.frameBgColor,
                        hold: this.getFrameHold(f)
                    })),
                    sharedStrokes: this.sharedStrokes,
                    fps: this.fps,
                    width: this.canvasWidth,
                    height: this.canvasHeight,
                    palette: this.palette
                };
                const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                const safeName = this.sanitizeProjectName(this.projectName) || 'motionsketch';
                a.href = url; a.download = `${safeName}.json`;
                a.click();
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
                reader.onload = (e) => {
                    try {
                        const data = JSON.parse(e.target.result);
                        this.importProjectData(data);
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
                if (!Number.isInteger(version) || version < 2 || version > 5) throw new Error('This project version is not supported');
                if (!Array.isArray(data.frames) || !data.frames.length) throw new Error('Project has no usable frames');

                this.frames = this.normalizeFrames(data.frames, data.paperStrokes);
                this.sharedStrokes = this.materializeErasers(data.sharedStrokes || []);
                this.fps = this.normalizeFps(data.fps);
                this.syncFpsUI();
                this.frameIndex = 0;
                this.projectName = typeof data.name === 'string' && data.name.trim() ? data.name : 'Untitled';
                if (data.width && data.height) this.resizeCanvas(data.width, data.height);
                if (Array.isArray(data.palette)) { this.palette = data.palette; this.renderPalette(); }
                this.renderUI();
                this.syncProjectNameUI();
                this.renderCanvas();
                this.saveStorage();
                this.showExportNotice(version < 5 ? 'Project upgraded and opened' : 'Project opened');
            }

            setFlyoutExpanded(wrapperId, anchorId, expanded) {
                document.getElementById(wrapperId)?.classList.toggle('expanded', expanded);
                document.getElementById(anchorId)?.setAttribute('aria-expanded', String(expanded));
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
                if (returnFocus) toggle.focus();
            }

            toggleExportMenu() {
                this.setExportMenuOpen(document.getElementById('export-menu')?.hidden);
            }

            runExport(format) {
                this.setExportMenuOpen(false);
                ({
                    gif: () => this.exportGIF(),
                    webm: () => this.exportWebM(),
                    png: () => this.exportFrame(),
                    'transparent-png': () => this.exportFrame(true),
                    svg: () => this.exportSVG(),
                    'png-sequence': () => this.exportPNGSequence()
                }[format])?.();
            }

            requestNewAnimation() { this.openModal('custom-modal', 'custom-modal'); }
            closeModal(id) {
                const modal = document.getElementById(id || 'custom-modal');
                modal.style.display = 'none';
                modal.setAttribute('aria-hidden', 'true');
                if (id === 'text-modal') this.editingTextObject = null;
                this.modalReturnFocus?.focus();
            }
            confirmNewAnimation(width = 600, height = 600) {
                this.closeModal();
                this.frames = [{ strokes: [], paperStrokes: [], hold: 1 }];
                this.paperStrokes = [];
                this.sharedStrokes = [];
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
                this.saveStorage();
            }

            groupSelection() {
                // Only works when a temporary multi-select (isGroup but NOT isPersistentGroup) is active
                if (!this.selectedObject || !this.selectedObject.isGroup || this.selectedObject.isPersistentGroup) return;
                this.saveState();

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
                this.updateThumbnails();
            }

            ungroupSelection() {
                // Only works on a persistent group selection
                if (!this.selectedObject || !this.selectedObject.isPersistentGroup) return;
                this.saveState();

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
                this.updateThumbnails();
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
                this.saveState();
                const bounds = this.selectedObject.bounds;
                this.selectedObject.items.forEach((item) => {
                    const itemBounds = this.getStrokeBounds(item.stroke);
                    const targetX = mode === 'left' ? bounds.x : mode === 'center' ? bounds.x + (bounds.w - itemBounds.w) / 2 : mode === 'right' ? bounds.x + bounds.w - itemBounds.w : itemBounds.x;
                    const targetY = mode === 'top' ? bounds.y : mode === 'middle' ? bounds.y + (bounds.h - itemBounds.h) / 2 : mode === 'bottom' ? bounds.y + bounds.h - itemBounds.h : itemBounds.y;
                    const dx = targetX - itemBounds.x, dy = targetY - itemBounds.y;
                    if (item.stroke.type === 'text') { item.stroke.x += dx; item.stroke.y += dy; }
                    else item.stroke.points?.forEach((point) => { point.x += dx; point.y += dy; });
                });
                this.selectedObject.bounds = this.getGroupBounds(this.selectedObject.items);
                this.renderCanvas(); this.updateThumbnails(); this.saveStorage();
            }

            deleteSelected() {
                if (!this.selectedObject) return;
                this.saveState();
                const list = this.getActiveStrokeList();

                if (this.selectedObject.isPersistentGroup) {
                    // Remove the single persistent group stroke
                    const idx = list.indexOf(this.selectedObject.persistentGroupStroke);
                    if (idx > -1) list.splice(idx, 1);
                } else if (this.selectedObject.isGroup) {
                    const itemsToRemove = new Set(this.selectedObject.items.map(i => i.stroke));
                    if (this.activeLayer === 'ink') {
                        this.frames[this.frameIndex].strokes = this.frames[this.frameIndex].strokes.filter(s => !itemsToRemove.has(s));
                    } else {
                        this.sharedStrokes = this.sharedStrokes.filter(s => !itemsToRemove.has(s));
                    }
                } else {
                    const idx = list.indexOf(this.selectedObject.stroke);
                    if (idx > -1) list.splice(idx, 1);
                }

                this.selectedObject = null;
                this.dragMode = null;
                this.renderCanvas();
                this.saveStorage();
                this.updateThumbnails();
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
                return true;
            }

            pasteSelection() {
                if (!this.clipboard) return false;
                {
                    this.saveState();
                    const list = this.getActiveStrokeList();

                    if (this.clipboard.type === 'group') {
                        // Paste persistent group as a new group stroke
                        const newGroup = JSON.parse(JSON.stringify(this.clipboard));
                        newGroup.items.forEach(item => {
                            if (item.type !== 'text') {
                                item.points.forEach(p => { p.x += 20; p.y += 20; });
                            } else {
                                item.x += 20; item.y += 20;
                            }
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
                            const newStroke = item.stroke;
                            if (newStroke.type !== 'text') {
                                newStroke.points.forEach(p => { p.x += 20; p.y += 20; });
                            } else {
                                newStroke.x += 20; newStroke.y += 20;
                            }
                            list.push(newStroke);
                            newItems.push({ stroke: newStroke, layer: this.activeLayer });
                        });
                        this.selectedObject = {
                            isGroup: true,
                            items: newItems,
                            bounds: this.getGroupBounds(newItems)
                        };
                    } else {
                        const newStroke = JSON.parse(JSON.stringify(this.clipboard));
                        if (newStroke.type !== 'text') {
                            newStroke.points.forEach(p => { p.x += 20; p.y += 20; });
                        } else {
                            newStroke.x += 20; newStroke.y += 20;
                        }
                        list.push(newStroke);
                        this.selectedObject = { stroke: newStroke, layer: this.activeLayer };
                        this.calcBounds(newStroke);
                    }
                    this.renderCanvas();
                    this.saveStorage();
                    this.updateThumbnails();
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
