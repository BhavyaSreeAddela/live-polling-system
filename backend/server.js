// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "http://localhost:5173", // Your frontend URL
        methods: ["GET", "POST"]
    }
});

app.use(cors());

// Store active polls and users
let activePoll = null;
let users = [];
let pollHistory = [];
let pollTimer = null;
let chatMessages = [];

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Handle user joining
    socket.on('user:join', ({ name, role }) => {
        console.log('User joining:', { name, role, socketId: socket.id });
        const user = { socketId: socket.id, name, role };
        users.push(user);
        console.log('Updated users list:', users);
        io.emit('server:update-users', users);

        // Send current poll state to new user
        if (activePoll) {
            console.log('Sending current poll to new user:', { question: activePoll.question, options: activePoll.options });
            socket.emit('server:new-poll', {
                question: activePoll.question,
                options: activePoll.options,
                timeLimit: activePoll.timeLimit
            });
            socket.emit('server:timer-update', activePoll.timeRemaining);
            socket.emit('server:update-results', activePoll.results);
        }

        // Send poll history to teachers
        if (role === 'teacher') {
            socket.emit('server:history-update', pollHistory);
        }
    });

    // Handle poll creation from teacher
    socket.on('teacher:create-poll', ({ question, options, timer }) => {
        console.log('Received poll creation request:', { question, options, timer });
        const user = users.find(u => u.socketId === socket.id);
        console.log('User attempting to create poll:', user);
        if (user?.role !== 'teacher') {
            console.log('Poll creation rejected: User is not a teacher');
            return;
        }

        // Create new poll
        activePoll = {
            question,
            options,
            results: options.map(text => ({ text, votes: 0 })),
            timeLimit: timer,
            timeRemaining: timer,
            votes: new Set(),
            startTime: Date.now()
        };
        console.log('New poll created:', activePoll);

        // Broadcast new poll to all users
        console.log('Broadcasting new poll to all users:', {
            question: activePoll.question,
            options: activePoll.options,
            timeLimit: activePoll.timeLimit
        });
        io.emit('server:new-poll', {
            question: activePoll.question,
            options: activePoll.options,
            timeLimit: activePoll.timeLimit
        });
        console.log('Poll broadcast complete');

        // Start timer
        if (pollTimer) clearInterval(pollTimer);
        pollTimer = setInterval(() => {
            if (activePoll.timeRemaining > 0) {
                activePoll.timeRemaining--;
                io.emit('server:timer-update', activePoll.timeRemaining);
            } else {
                endPoll();
            }
        }, 1000);
    });

    // Handle student votes
    socket.on('student:submit-vote', (optionIndex) => {
        console.log('Received vote from student:', socket.id, 'for option:', optionIndex);
        console.log('Current active poll state:', activePoll ? {
            question: activePoll.question,
            options: activePoll.options,
            votes: Array.from(activePoll.votes),
            results: activePoll.results
        } : 'No active poll');
        
        if (!activePoll || activePoll.votes.has(socket.id)) {
            console.log('Vote rejected:', !activePoll ? 'No active poll' : 'Student already voted');
            return;
        }

        // Record vote
        activePoll.votes.add(socket.id);
        activePoll.results[optionIndex].votes++;
        
        // Create a clean copy of results for broadcasting
        const currentResults = activePoll.results.map(result => ({
            text: result.text,
            votes: result.votes
        }));
        
        console.log('Updated results:', currentResults);
        
        // Broadcast updated results
        io.emit('server:update-results', currentResults);
        console.log('Results broadcasted to all users');

        // Check if all students have voted
        const studentCount = users.filter(u => u.role === 'student').length;
        console.log('Vote count:', activePoll.votes.size, '/', studentCount, 'students');
        
        if (activePoll.votes.size >= studentCount) {
            console.log('All students have voted, ending poll');
            endPoll();
        }
    });

    // Handle student removal by teacher
    socket.on('teacher:remove-student', (studentSocketId) => {
        const user = users.find(u => u.socketId === socket.id);
        if (user?.role !== 'teacher') return;

        const student = users.find(u => u.socketId === studentSocketId);
        if (student?.role === 'student') {
            users = users.filter(u => u.socketId !== studentSocketId);
            io.emit('server:update-users', users);
            io.to(studentSocketId).emit('server:you-were-removed');
        }
    });

    // Handle chat messages
    socket.on('chat:send-message', ({ message, recipientId }) => {
        const sender = users.find(u => u.socketId === socket.id);
        if (!sender) return;

        const chatMessage = {
            id: Date.now(),
            senderId: socket.id,
            senderName: sender.name,
            senderRole: sender.role,
            recipientId,
            message,
            timestamp: Date.now()
        };

        // Store the message
        chatMessages.push(chatMessage);
        if (chatMessages.length > 100) chatMessages.shift(); // Keep only last 100 messages

        // Send to specific recipient if provided, otherwise broadcast to all
        if (recipientId) {
            io.to(recipientId).emit('server:chat-message', chatMessage);
            socket.emit('server:chat-message', chatMessage); // Send back to sender
        } else {
            io.emit('server:chat-message', chatMessage);
        }
    });

    // Handle chat history request
    socket.on('chat:request-history', () => {
        socket.emit('server:chat-history', chatMessages);
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        users = users.filter(user => user.socketId !== socket.id);
        io.emit('server:update-users', users);
    });
});

// Helper function to end current poll
function endPoll() {
    if (!activePoll) return;

    clearInterval(pollTimer);
    
    // Ensure results are properly structured before saving
    const finalResults = activePoll.results.map(result => ({
        text: result.text,
        votes: result.votes
    }));
    
    // Save to history with the properly structured results
    pollHistory.unshift({
        question: activePoll.question,
        results: finalResults,
        endedAt: Date.now()
    });
    
    // Keep only last 50 polls
    if (pollHistory.length > 50) {
        pollHistory.pop();
    }

    console.log('Poll ended with results:', finalResults);
    console.log('Updated poll history:', pollHistory);

    // Broadcast end of poll with the properly structured results
    io.emit('server:poll-ended', finalResults);
    io.emit('server:history-update', pollHistory);
    
    activePoll = null;
    pollTimer = null;
}

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});