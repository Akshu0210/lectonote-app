document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const startBtn = document.getElementById('start-btn');
    const stopBtn = document.getElementById('stop-btn');
    const clearBtn = document.getElementById('clear-btn');
    const timerDisplay = document.getElementById('timer');
    const transcriptionText = document.getElementById('transcription-text');
    const noteTitleInput = document.getElementById('note-title');
    const saveBtn = document.getElementById('save-btn');
    const searchInput = document.getElementById('search-input');
    const notesList = document.getElementById('notes-list');
    const notesCount = document.getElementById('notes-count');

    // State Variables
    let recognition = null;
    let isRecording = false;
    let finalTranscript = '';
    let timerInterval = null;
    let startTime = null;
    let notes = JSON.parse(localStorage.getItem('lectoNotes')) || [];

    // Initialize Web Speech API
    function initSpeechRecognition() {
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            transcriptionText.textContent = "Error: Speech Recognition API is not supported in this browser. Try Chrome or Edge.";
            transcriptionText.classList.remove('placeholder-text');
            startBtn.disabled = true;
            return false;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognition = new SpeechRecognition();
        
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US'; // Could be dynamic based on user settings

        recognition.onstart = () => {
            isRecording = true;
            toggleButtons();
            startTimer();
            if (finalTranscript === '') {
                transcriptionText.textContent = "Listening...";
                transcriptionText.classList.remove('placeholder-text');
            }
        };

        recognition.onresult = (event) => {
            let interimTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript + ' ';
                } else {
                    interimTranscript += event.results[i][0].transcript;
                }
            }

            const displayText = finalTranscript + interimTranscript;
            if (displayText.trim().length > 0) {
                transcriptionText.textContent = displayText;
                transcriptionText.classList.remove('placeholder-text');
                
                // Auto scroll to bottom of transcription box
                transcriptionText.parentElement.scrollTop = transcriptionText.parentElement.scrollHeight;
            }
        };

        recognition.onerror = (event) => {
            console.error("Speech recognition error:", event.error);
            if(event.error === 'not-allowed') {
                alert("Microphone access denied. Please allow microphone access to use this feature.");
                stopRecording();
            }
            if(event.error === 'network') {
                alert("Network error occurred with Speech Recognition API.");
                stopRecording();
            }
        };

        recognition.onend = () => {
            // Speech API often stops automatically after a pause or time limit.
            // If the user hasn't pressed stop manually, we restart it.
            if (isRecording) {
                try {
                    recognition.start();
                } catch(e) {
                    console.error("Could not restart recognition automatically", e);
                    stopRecording();
                }
            }
        };

        return true;
    }

    // Timer Functions
    function startTimer() {
        if (!startTime) startTime = Date.now();
        updateTimer();
        timerInterval = setInterval(updateTimer, 1000);
    }

    function stopTimer() {
        clearInterval(timerInterval);
        startTime = null;
    }

    function resetTimer() {
        stopTimer();
        timerDisplay.textContent = "00:00";
    }

    function updateTimer() {
        const elapsedTime = Date.now() - startTime;
        const totalSeconds = Math.floor(elapsedTime / 1000);
        const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
        const seconds = (totalSeconds % 60).toString().padStart(2, '0');
        timerDisplay.textContent = `${minutes}:${seconds}`;
    }

    // Recording Controls
    function startRecording() {
        if (!recognition && !initSpeechRecognition()) return;
        
        try {
            recognition.start();
        } catch(e) {
            console.error("Could not start recognition:", e);
        }
    }

    function stopRecording() {
        if (!isRecording) return;
        
        isRecording = false;
        recognition.stop();
        stopTimer();
        toggleButtons();
    }

    function clearText() {
        if (isRecording) return; 
        
        finalTranscript = '';
        transcriptionText.textContent = "Your spoken words will appear here in real-time...";
        transcriptionText.classList.add('placeholder-text');
        resetTimer();
        noteTitleInput.value = '';
    }

    function toggleButtons() {
        if (isRecording) {
            startBtn.style.display = 'none';
            stopBtn.style.display = 'flex';
        } else {
            startBtn.style.display = 'flex';
            stopBtn.style.display = 'none';
        }
    }

    // Notes Management
    function saveNote() {
        const title = noteTitleInput.value.trim();
        const content = finalTranscript.trim() || transcriptionText.textContent.trim();
        
        if (content === '' || content === "Your spoken words will appear here in real-time..." || content === "Listening...") {
            alert("No text to save. Please record a lecture first.");
            return;
        }

        const note = {
            id: Date.now().toString(),
            title: title || 'Untitled Note',
            content: content,
            date: new Date().toISOString()
        };

        notes.unshift(note); 
        saveToLocalStorage();
        renderNotes();
        
        // Reset after save
        clearText();
        alert("Note saved successfully!");
    }

    function deleteNote(id) {
        if(confirm("Are you sure you want to delete this note?")) {
            notes = notes.filter(note => note.id !== id);
            saveToLocalStorage();
            renderNotes(notes, searchInput.value); // Re-render with active search if any
        }
    }

    function saveToLocalStorage() {
        localStorage.setItem('lectoNotes', JSON.stringify(notes));
    }

    // Filtering & Rendering
    function filterNotes(query) {
        const lowerQuery = query.toLowerCase();
        const filteredNotes = notes.filter(note => 
            note.title.toLowerCase().includes(lowerQuery) || 
            note.content.toLowerCase().includes(lowerQuery)
        );
        renderNotes(filteredNotes, query);
    }

    function formatDate(dateString) {
        const options = { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
        return new Date(dateString).toLocaleDateString(undefined, options);
    }

    function renderNotes(notesToRender = notes, query = '') {
        notesList.innerHTML = '';
        
        // Show count based on search results or total notes
        if (query) {
             notesCount.textContent = `${notesToRender.length} found`;
        } else {
             notesCount.textContent = `${notesToRender.length} note${notesToRender.length !== 1 ? 's' : ''}`;
        }
        
        if (notesToRender.length === 0) {
            notesList.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 30px;">No notes available.</p>';
            return;
        }

        notesToRender.forEach(note => {
            const noteEl = document.createElement('div');
            noteEl.className = 'note-item';
            
            noteEl.innerHTML = `
                <div class="note-header">
                    <div class="note-title">${escapeHTML(note.title)}</div>
                    <div class="note-date">${formatDate(note.date)}</div>
                </div>
                <div class="note-content">${escapeHTML(note.content)}</div>
                <div class="note-actions">
                    <button class="btn-delete" data-id="${note.id}">Delete Note</button>
                </div>
            `;
            
            notesList.appendChild(noteEl);
        });

        // Add event listeners for new delete buttons
        document.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                deleteNote(e.target.getAttribute('data-id'));
            });
        });
    }

    function escapeHTML(str) {
        const div = document.createElement('div');
        div.innerText = str;
        return div.innerHTML;
    }

    // Event Listeners
    startBtn.addEventListener('click', startRecording);
    stopBtn.addEventListener('click', stopRecording);
    clearBtn.addEventListener('click', () => {
        if(confirm("Are you sure you want to clear the transcription?")) {
            clearText();
        }
    });
    saveBtn.addEventListener('click', saveNote);
    
    searchInput.addEventListener('input', (e) => {
        filterNotes(e.target.value);
    });

    // Initial setup
    initSpeechRecognition();
    renderNotes();
});
