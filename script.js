document.addEventListener('DOMContentLoaded', async () => {
    // --- IndexedDB Setup ---
    let db;
    const DB_NAME = 'LectoNoteProDB';
    const DB_VERSION = 1;

    function initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onerror = (e) => reject(e.target.errorCode);
            request.onsuccess = (e) => {
                db = e.target.result;
                resolve(db);
            };
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('notes')) {
                    db.createObjectStore('notes', { keyPath: 'id' });
                }
            };
        });
    }

    const dbFuncs = {
        saveNote: (note) => {
            return new Promise((resolve, reject) => {
                const tx = db.transaction(['notes'], 'readwrite');
                const store = tx.objectStore('notes');
                store.put(note);
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            });
        },
        getAllNotes: () => {
            return new Promise((resolve, reject) => {
                const tx = db.transaction(['notes'], 'readonly');
                const store = tx.objectStore('notes');
                const request = store.getAll();
                request.onsuccess = () => resolve(request.result.sort((a,b) => b.date - a.date));
                request.onerror = () => reject(request.error);
            });
        },
        deleteNote: (id) => {
            return new Promise((resolve, reject) => {
                const tx = db.transaction(['notes'], 'readwrite');
                const store = tx.objectStore('notes');
                store.delete(id);
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            });
        }
    };

    try {
        await initDB();
    } catch (e) {
        console.error("IndexedDB init failed:", e);
        alert("Warning: Offline storage unavailable.");
    }

    // --- Theme Toggle ---
    const themeToggleBtn = document.getElementById('theme-toggle');
    const isLightMode = localStorage.getItem('lectonote_theme') === 'light';
    if (isLightMode) document.body.classList.add('light-theme');
    
    themeToggleBtn.addEventListener('click', () => {
        document.body.classList.toggle('light-theme');
        const theme = document.body.classList.contains('light-theme') ? 'light' : 'dark';
        localStorage.setItem('lectonote_theme', theme);
    });

    let currentAudioBlob = null;

    // --- Speech to Text ---
    const startSpeechBtn = document.getElementById('start-speech');
    const stopSpeechBtn = document.getElementById('stop-speech');
    const speechStatus = document.getElementById('speech-status');
    const transcriptionText = document.getElementById('transcription-text');
    const clearTextBtn = document.getElementById('clear-text');
    const speechLangSelect = document.getElementById('speech-lang');

    let recognition = null;
    if ('webkitSpeechRecognition' in window) {
        recognition = new webkitSpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;

        recognition.onstart = () => {
            speechStatus.innerHTML = '<i class="fa-solid fa-microphone-lines"></i> Listening (🔴 Recording)';
            speechStatus.classList.add('recording');
            startSpeechBtn.disabled = true;
            stopSpeechBtn.disabled = false;
        };

        recognition.onresult = (event) => {
            let finalTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                if (event.results[i].isFinal) finalTranscript += event.results[i][0].transcript + ' ';
            }
            if (finalTranscript) {
                transcriptionText.appendChild(document.createTextNode(finalTranscript));
            }
        };

        recognition.onerror = (event) => {
            console.error('Speech error', event.error);
            speechStatus.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> Error: ${event.error}`;
            speechStatus.classList.remove('recording');
            startSpeechBtn.disabled = false;
            stopSpeechBtn.disabled = true;
        };

        recognition.onend = () => {
            speechStatus.textContent = 'Stopped listening.';
            speechStatus.classList.remove('recording');
            startSpeechBtn.disabled = false;
            stopSpeechBtn.disabled = true;
        };
    } else {
        speechStatus.innerHTML = '<i class="fa-solid fa-circle-xmark"></i> Web Speech API not supported.';
        startSpeechBtn.disabled = true;
    }

    startSpeechBtn.addEventListener('click', () => {
        if (recognition) {
            recognition.lang = speechLangSelect.value;
            recognition.start();
        }
    });

    stopSpeechBtn.addEventListener('click', () => {
        if (recognition) recognition.stop();
    });

    clearTextBtn.addEventListener('click', () => {
        clearTextBtn.innerHTML = '<i class="fa-solid fa-check"></i>';
        setTimeout(() => clearTextBtn.innerHTML = '<i class="fa-solid fa-trash"></i>', 1000);
        transcriptionText.innerHTML = '';
    });

    // --- Rich Text Toolbar ---
    const rtBtns = document.querySelectorAll('.rt-btn');
    rtBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            document.execCommand(btn.dataset.command, false, null);
            transcriptionText.focus();
        });
    });

    const copyTextBtn = document.getElementById('copy-text');
    copyTextBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(transcriptionText.innerText).then(() => {
            const origHTML = copyTextBtn.innerHTML;
            copyTextBtn.innerHTML = '<i class="fa-solid fa-check"></i>';
            setTimeout(() => copyTextBtn.innerHTML = origHTML, 1500);
        });
    });

    // --- Audio Recording ---
    const startAudioBtn = document.getElementById('start-audio');
    const stopAudioBtn = document.getElementById('stop-audio');
    const pauseAudioBtn = document.getElementById('pause-audio');
    const resumeAudioBtn = document.getElementById('resume-audio');
    const audioTimer = document.getElementById('audio-timer');
    const audioPlayback = document.getElementById('audio-playback');
    const downloadAudioBtn = document.getElementById('download-audio');
    const audioPreviewContainer = document.getElementById('audio-preview-container');

    let mediaRecorder;
    let audioChunks = [];
    let timerInterval;
    let secondsElapsed = 0;

    function formatTimer(sec) {
        const m = Math.floor(sec / 60).toString().padStart(2, '0');
        const s = (sec % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    }

    startAudioBtn.addEventListener('click', async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];
            currentAudioBlob = null;

            mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };

            mediaRecorder.onstop = () => {
                currentAudioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                const audioUrl = URL.createObjectURL(currentAudioBlob);
                audioPlayback.src = audioUrl;
                audioPreviewContainer.style.display = 'block';
                
                downloadAudioBtn.href = audioUrl;
                downloadAudioBtn.download = `Lecture_Audio_${Date.now()}.webm`;

                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorder.start();
            startAudioBtn.style.display = 'none';
            pauseAudioBtn.style.display = 'inline-flex';
            resumeAudioBtn.style.display = 'none';
            stopAudioBtn.disabled = false;
            
            secondsElapsed = 0;
            audioTimer.textContent = '00:00';
            timerInterval = setInterval(() => {
                secondsElapsed++;
                audioTimer.textContent = formatTimer(secondsElapsed);
            }, 1000);

            audioTimer.classList.add('recording');

        } catch (err) {
            console.error('Mic error', err);
            alert('Could not access microphone! Ensure permissions are granted.');
        }
    });

    stopAudioBtn.addEventListener('click', () => {
        if (mediaRecorder && (mediaRecorder.state === 'recording' || mediaRecorder.state === 'paused')) {
            mediaRecorder.stop();
            startAudioBtn.style.display = 'inline-flex';
            pauseAudioBtn.style.display = 'none';
            resumeAudioBtn.style.display = 'none';
            stopAudioBtn.disabled = true;
            clearInterval(timerInterval);
            audioTimer.classList.remove('recording');
        }
    });

    pauseAudioBtn.addEventListener('click', () => {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.pause();
            pauseAudioBtn.style.display = 'none';
            resumeAudioBtn.style.display = 'inline-flex';
            clearInterval(timerInterval);
            audioTimer.classList.remove('recording');
        }
    });

    resumeAudioBtn.addEventListener('click', () => {
        if (mediaRecorder && mediaRecorder.state === 'paused') {
            mediaRecorder.resume();
            resumeAudioBtn.style.display = 'none';
            pauseAudioBtn.style.display = 'inline-flex';
            timerInterval = setInterval(() => {
                secondsElapsed++;
                audioTimer.textContent = formatTimer(secondsElapsed);
            }, 1000);
            audioTimer.classList.add('recording');
        }
    });

    // --- Drawing Canvas ---
    const canvas = document.getElementById('drawing-canvas');
    const ctx = canvas.getContext('2d');
    const clearCanvasBtn = document.getElementById('clear-canvas');
    const undoCanvasBtn = document.getElementById('undo-canvas');
    const redoCanvasBtn = document.getElementById('redo-canvas');
    const downloadCanvasBtn = document.getElementById('download-canvas');
    
    // Canvas Toolbar Tools
    const brushColorInp = document.getElementById('brush-color');
    const brushSizeInp = document.getElementById('brush-size');
    const eraserModeBtn = document.getElementById('eraser-mode');
    const uploadImageBtn = document.getElementById('upload-image-btn');
    const imageUploadInp = document.getElementById('image-upload');
    
    let isEraser = false;

    let isDrawing = false;
    let lastX = 0;
    let lastY = 0;
    
    let undoStack = [];
    let redoStack = [];

    function saveState() {
        undoStack.push(canvas.toDataURL());
        redoStack = [];
    }

    function restoreState(dataUrl) {
        const img = new Image();
        img.onload = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
        };
        img.src = dataUrl;
    }

    function resizeCanvas() {
        const rect = canvas.parentElement.getBoundingClientRect();
        const data = canvas.toDataURL();
        
        canvas.width = rect.width;
        canvas.height = rect.height;
        
        ctx.strokeStyle = brushColorInp.value;
        ctx.lineWidth = brushSizeInp.value;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        if (isEraser) ctx.globalCompositeOperation = 'destination-out';
        
        const img = new Image();
        img.onload = () => {
            ctx.drawImage(img, 0, 0);
            if (undoStack.length === 0) undoStack.push(canvas.toDataURL());
        };
        img.src = data;
    }

    window.addEventListener('resize', resizeCanvas);
    setTimeout(resizeCanvas, 100);

    function getMousePos(e) {
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return { x: clientX - rect.left, y: clientY - rect.top };
    }

    function startDrawing(e) {
        e.preventDefault();
        isDrawing = true;
        const pos = getMousePos(e);
        lastX = pos.x;
        lastY = pos.y;
    }

    function draw(e) {
        if (!isDrawing) return;
        e.preventDefault();
        const pos = getMousePos(e);
        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
        lastX = pos.x;
        lastY = pos.y;
    }

    function stopDrawing() {
        if (isDrawing) {
            isDrawing = false;
            saveState();
        }
    }

    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseout', stopDrawing);

    canvas.addEventListener('touchstart', startDrawing, { passive: false });
    canvas.addEventListener('touchmove', draw, { passive: false });
    canvas.addEventListener('touchend', stopDrawing);

    // Toolbar Listeners
    brushColorInp.addEventListener('input', (e) => {
        ctx.strokeStyle = e.target.value;
        isEraser = false;
        eraserModeBtn.classList.remove('active');
        ctx.globalCompositeOperation = 'source-over';
    });

    brushSizeInp.addEventListener('input', (e) => {
        ctx.lineWidth = e.target.value;
    });

    eraserModeBtn.addEventListener('click', () => {
        isEraser = !isEraser;
        eraserModeBtn.classList.toggle('active', isEraser);
        ctx.globalCompositeOperation = isEraser ? 'destination-out' : 'source-over';
    });

    uploadImageBtn.addEventListener('click', () => imageUploadInp.click());

    imageUploadInp.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const scale = Math.min(canvas.width / img.width, canvas.height / img.height) * 0.9;
                const x = (canvas.width / 2) - (img.width / 2) * scale;
                const y = (canvas.height / 2) - (img.height / 2) * scale;
                ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
                saveState();
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    });

    downloadCanvasBtn.addEventListener('click', () => {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        const tCtx = tempCanvas.getContext('2d');
        tCtx.fillStyle = document.body.classList.contains('light-theme') ? '#ffffff' : '#0a0f1d';
        tCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
        tCtx.drawImage(canvas, 0, 0);

        const link = document.createElement('a');
        link.download = `Lecture_Drawing_${Date.now()}.png`;
        link.href = tempCanvas.toDataURL('image/png');
        link.click();
    });

    clearCanvasBtn.addEventListener('click', () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        saveState();
        clearCanvasBtn.innerHTML = '<i class="fa-solid fa-check"></i>';
        setTimeout(() => clearCanvasBtn.innerHTML = '<i class="fa-solid fa-trash"></i>', 800);
    });

    undoCanvasBtn.addEventListener('click', () => {
        if (undoStack.length > 1) {
            redoStack.push(undoStack.pop());
            restoreState(undoStack[undoStack.length - 1]);
        }
    });

    redoCanvasBtn.addEventListener('click', () => {
        if (redoStack.length > 0) {
            const state = redoStack.pop();
            undoStack.push(state);
            restoreState(state);
        }
    });

    // --- Notes Management ---
    const noteTitleInput = document.getElementById('note-title');
    const saveNoteBtn = document.getElementById('save-note');
    const notesListContainer = document.getElementById('notes-list');
    const searchNotesInput = document.getElementById('search-notes');

    async function renderNotes(filterText = '') {
        notesListContainer.innerHTML = '';
        try {
            const notes = await dbFuncs.getAllNotes();
            const filteredNotes = notes.filter(n => 
                n.title.toLowerCase().includes(filterText.toLowerCase()) || 
                n.text.toLowerCase().includes(filterText.toLowerCase())
            );
            
            if (filteredNotes.length === 0) {
                notesListContainer.innerHTML = '<p class="text-muted" style="text-align: center; padding: 1.5rem;"><i class="fa-solid fa-box-open" style="font-size: 2rem; margin-bottom: 0.5rem; display: block;"></i> No notes found.</p>';
                return;
            }

            filteredNotes.forEach(note => {
                const noteEl = document.createElement('div');
                noteEl.classList.add('note-item');
                
                const audioBadge = note.audioBlob ? `<span style="color:var(--accent); font-size: 0.85rem;"><i class="fa-solid fa-microphone"></i> Audio Attached</span>` : '';
                let audioPlayerHTML = '';
                if (note.audioBlob) {
                    const audioUrl = URL.createObjectURL(note.audioBlob);
                    audioPlayerHTML = `<audio controls src="${audioUrl}" style="width: 100%; height: 35px; margin-top: 0.5rem;"></audio>`;
                }
                
                noteEl.innerHTML = `
                    <div class="note-header">
                        <div class="note-title"><i class="fa-regular fa-file-lines text-muted"></i> ${note.title}</div>
                        <div class="note-date">${new Date(note.date).toLocaleString()}</div>
                    </div>
                    <div class="note-preview">${note.text || '<em>No text</em>'}</div>
                    ${audioBadge}
                    ${audioPlayerHTML}
                    <div class="note-actions">
                        <button class="btn secondary load-note" data-id="${note.id}"><i class="fa-solid fa-cloud-arrow-down"></i> Load</button>
                        <button class="btn danger delete-note" data-id="${note.id}"><i class="fa-solid fa-trash-can"></i></button>
                    </div>
                `;
                notesListContainer.appendChild(noteEl);
            });

            document.querySelectorAll('.load-note').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const btnEl = e.currentTarget;
                    const id = btnEl.getAttribute('data-id');
                    const allNotes = await dbFuncs.getAllNotes();
                    const note = allNotes.find(n => n.id === id);
                    if (note) {
                        transcriptionText.innerHTML = note.text;
                        noteTitleInput.value = note.title;
                        if (note.canvasData) {
                            restoreState(note.canvasData);
                            undoStack = [note.canvasData];
                            redoStack = [];
                        } else {
                            ctx.clearRect(0, 0, canvas.width, canvas.height);
                            undoStack = [canvas.toDataURL()];
                            redoStack = [];
                        }
                        const origHtml = btnEl.innerHTML;
                        btnEl.innerHTML = '<i class="fa-solid fa-check"></i> Loaded';
                        btnEl.classList.add('accent');
                        setTimeout(() => { btnEl.innerHTML = origHtml; btnEl.classList.remove('accent'); }, 1500);
                    }
                });
            });

            document.querySelectorAll('.delete-note').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const id = e.currentTarget.getAttribute('data-id');
                    await dbFuncs.deleteNote(id);
                    renderNotes(searchNotesInput.value);
                });
            });
        } catch (err) { console.error(err); }
    }

    saveNoteBtn.addEventListener('click', async () => {
        const title = noteTitleInput.value.trim();
        const text = transcriptionText.innerHTML;
        
        if (!title) {
            alert('Please enter a note title.');
            noteTitleInput.focus();
            return;
        }

        const origHTML = saveNoteBtn.innerHTML;
        saveNoteBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
        saveNoteBtn.disabled = true;

        const newNote = {
            id: Date.now().toString(),
            title: title || 'Untitled Note',
            text: text,
            canvasData: canvas.toDataURL(),
            audioBlob: currentAudioBlob,
            date: Date.now()
        };

        try {
            await dbFuncs.saveNote(newNote);
            
            // Auto-generate PDF on save
            generateAndDownloadPDF(newNote.title, transcriptionText.innerText, newNote.canvasData);

            currentAudioBlob = null;
            audioPreviewContainer.style.display = 'none';
            audioPlayback.src = '';
            noteTitleInput.value = '';
            
            await renderNotes();
            
            saveNoteBtn.innerHTML = '<i class="fa-solid fa-check"></i> Saved & Exported!';
            saveNoteBtn.classList.replace('primary', 'accent');
        } catch (e) {
            alert('Failed to save to DB.');
            saveNoteBtn.innerHTML = '<i class="fa-solid fa-xmark"></i> Error';
            saveNoteBtn.classList.replace('primary', 'danger');
        }
        setTimeout(() => {
            saveNoteBtn.innerHTML = origHTML;
            saveNoteBtn.disabled = false;
            saveNoteBtn.classList.remove('accent', 'danger');
            saveNoteBtn.classList.add('primary');
        }, 2000);
    });

    searchNotesInput.addEventListener('input', (e) => {
        renderNotes(e.target.value);
    });

    setTimeout(() => renderNotes(), 100);

    // --- PDF Export ---
    function generateAndDownloadPDF(title, text, canvasDataUrl) {
        if (!window.jspdf || !window.jspdf.jsPDF) {
            console.error('PDF Library not loaded.');
            return false;
        }
        try {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            
            doc.setFontSize(22);
            doc.text(title, 10, 20);
            doc.setFontSize(12);
            const splitText = doc.splitTextToSize(text, 190);
            doc.text(splitText, 10, 30);
            
            let textHeight = splitText.length * 5;
            let imageY = 30 + textHeight + 10;
            const ratio = canvas.height / canvas.width;
            const pdfImgHeight = 190 * ratio;

            if (imageY + pdfImgHeight > 280) {
                doc.addPage();
                imageY = 20;
            }
            doc.text("Drawing Notes:", 10, imageY - 5);
            doc.addImage(canvasDataUrl, 'PNG', 10, imageY, 190, pdfImgHeight);
            doc.save(`${title.replace(/\s+/g, '_')}.pdf`);
            return true;
        } catch (err) {
            console.error(err);
            return false;
        }
    }

    const exportPdfBtn = document.getElementById('export-pdf');

    exportPdfBtn.addEventListener('click', () => {
        if (!window.jspdf || !window.jspdf.jsPDF) {
            alert('PDF Library loading. Please try again.');
            return;
        }
        const origHtml = exportPdfBtn.innerHTML;
        exportPdfBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...';
        exportPdfBtn.disabled = true;

        setTimeout(() => {
            const title = noteTitleInput.value.trim() || 'LectoNote_Export';
            const text = transcriptionText.innerText;
            const canvasData = canvas.toDataURL('image/png');
            
            const success = generateAndDownloadPDF(title, text, canvasData);
            
            if (success) {
                exportPdfBtn.innerHTML = '<i class="fa-solid fa-check"></i> Exported';
                exportPdfBtn.classList.replace('accent', 'primary');
            } else {
                exportPdfBtn.innerHTML = '<i class="fa-solid fa-xmark"></i> Error';
                exportPdfBtn.classList.replace('accent', 'danger');
            }
            
            setTimeout(() => {
                exportPdfBtn.innerHTML = origHtml;
                exportPdfBtn.disabled = false;
                exportPdfBtn.className = 'btn accent';
            }, 2000);
        }, 100);
    });
});
