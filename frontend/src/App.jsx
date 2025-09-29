import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { PieChart, Pie, Cell, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from 'recharts';
import { User, Crown, Send, Users, CheckCircle, Clock, Trash2, XCircle, LogOut, MessageCircle } from 'lucide-react';
import ChatPopup from './ChatPopup';

// IMPORTANT: Replace with your server's address
const SERVER_URL = 'http://localhost:4000'; 

// --- Helper Components ---

const IconWrapper = ({ children }) => <div className="flex items-center justify-center w-12 h-12 bg-gray-100 rounded-full dark:bg-gray-800">{children}</div>;

const Card = ({ children, className = '', isSelected = false }) => (
    <div className={`card ${isSelected ? 'card-selected' : ''} ${className}`}>
        {children}
    </div>
);

const Button = ({ children, onClick, className = '', variant = 'primary', ...props }) => {
    const baseClasses = 'btn-primary min-h-[48px] min-w-[160px]';
    return (
        <button 
            onClick={onClick} 
            className={`${baseClasses} ${className}`} 
            {...props}
        >
            {children}
        </button>
    );
};

// --- Main Application ---
export default function App() {
    const [socket, setSocket] = useState(null);
    const [view, setView] = useState('ROLE_SELECTION'); // ROLE_SELECTION, NAME_INPUT, DASHBOARD
    const [role, setRole] = useState(null);
    const [name, setName] = useState('');
    
    // Global state
    const [users, setUsers] = useState([]);
    const [poll, setPoll] = useState({ question: null, options: [], isActive: false });
    const [results, setResults] = useState([]);
    const [timer, setTimer] = useState(0);
    const [hasVoted, setHasVoted] = useState(false);
    const [pollHistory, setPollHistory] = useState([]);
    const [isChatOpen, setIsChatOpen] = useState(false);

    const nameInputRef = useRef(null);
    const mySocketId = socket?.id;

    // Establish socket connection
    useEffect(() => {
        const newSocket = io(SERVER_URL);
        setSocket(newSocket);
        return () => newSocket.close();
    }, []);

    // Socket event listeners
    useEffect(() => {
        if (!socket) return;

        socket.on('connect', () => console.log('Connected to server!', socket.id));
        socket.on('server:update-users', setUsers);
        socket.on('server:new-poll', (newPoll) => {
            console.log('Received new poll from server:', newPoll);
            setPoll({ ...newPoll, isActive: true });
            setResults([]);
            setHasVoted(false);
            console.log('Updated poll state:', { ...newPoll, isActive: true });
        });
        socket.on('server:timer-update', setTimer);
        socket.on('server:update-results', (updatedResults) => {
            console.log('Received updated results:', updatedResults);
            setResults(updatedResults);
        });
        socket.on('server:poll-ended', (finalResults) => {
            console.log('Poll ended with final results:', finalResults);
            setPoll(p => ({ ...p, isActive: false }));
            setResults(finalResults);
        });
        socket.on('server:history-update', setPollHistory);
        socket.on('server:you-were-removed', () => {
            alert('You have been removed from the session by the teacher.');
            window.location.reload();
        });

        return () => {
            socket.off('connect');
            socket.off('server:update-users');
            socket.off('server:new-poll');
            socket.off('server:timer-update');
            socket.off('server:update-results');
            socket.off('server:poll-ended');
            socket.off('server:history-update');
            socket.off('server:you-were-removed');
        };
    }, [socket]);
    
    // --- Handlers ---
    const handleRoleSelect = (selectedRole) => {
        setRole(selectedRole);
        setView('NAME_INPUT');
        setTimeout(() => nameInputRef.current?.focus(), 100);
    };

    const handleNameSubmit = (e) => {
        e.preventDefault();
        if (name.trim()) {
            socket.emit('user:join', { name: name.trim(), role });
            setView('DASHBOARD');
        }
    };
    
    const handleCreatePoll = ({ question, options, timer }) => {
        socket.emit('teacher:create-poll', { question, options, timer });
    };

    const handleVote = (optionIndex) => {
        if (!hasVoted) {
            console.log('Submitting vote for option:', optionIndex);
            console.log('Current poll state:', poll);
            socket.emit('student:submit-vote', optionIndex);
            setHasVoted(true);
            console.log('Vote submitted and marked as voted');
        } else {
            console.log('Vote not submitted - user has already voted');
        }
    };

    const handleRemoveStudent = (studentSocketId) => {
        if (window.confirm("Are you sure you want to remove this student?")) {
            socket.emit('teacher:remove-student', studentSocketId);
        }
    };

    // --- Render Logic ---
    const renderContent = () => {
        switch (view) {
            case 'ROLE_SELECTION':
                return <RoleSelector onSelect={handleRoleSelect} />;
            case 'NAME_INPUT':
                return <NameInput role={role} name={name} setName={setName} onSubmit={handleNameSubmit} inputRef={nameInputRef} />;
            case 'DASHBOARD':
                return role === 'teacher' ? 
                    <TeacherDashboard 
                        name={name} 
                        users={users} 
                        poll={poll}
                        results={results}
                        timer={timer}
                        pollHistory={pollHistory}
                        onCreatePoll={handleCreatePoll}
                        onRemoveStudent={handleRemoveStudent}
                        myId={mySocketId}
                    /> : 
                    <StudentDashboard 
                        name={name}
                        poll={poll}
                        results={results}
                        timer={timer}
                        hasVoted={hasVoted}
                        onVote={handleVote}
                    />;
            default:
                return <RoleSelector onSelect={handleRoleSelect} />;
        }
    };

    return (
        <main className="min-h-screen pt-24 pb-16">
            {renderContent()}
            
            {/* Chat button and popup */}
            {view === 'DASHBOARD' && (
                <>
                    <button
                        onClick={() => setIsChatOpen(true)}
                        className="fixed bottom-8 right-8 p-4 bg-primary text-white rounded-full shadow-lg hover:bg-primary-hover transition-all"
                        style={{ display: isChatOpen ? 'none' : 'block' }}
                    >
                        <MessageCircle className="w-6 h-6" />
                    </button>
                    <ChatPopup
                        socket={socket}
                        user={{ name, role }}
                        users={users}
                        isOpen={isChatOpen}
                        onClose={() => setIsChatOpen(false)}
                    />
                </>
            )}
        </main>
    );
}

// --- View Components ---

function RoleSelector({ onSelect }) {
    const [selectedRole, setSelectedRole] = useState(null);

    const handleRoleSelect = (role) => {
        setSelectedRole(role);
        setTimeout(() => onSelect(role), 100); // Add a small delay for animation
    };

    return (
        <div className="container animate-fade-in">
            <div className="text-center mb-16">
                <h1 className="heading-main">Welcome to Live Poll</h1>
                <p className="heading-sub mt-4">Who are you joining as?</p>
            </div>
            <div className="role-cards-container">
                <button 
                    onClick={() => handleRoleSelect('teacher')}
                    className="role-card"
                >
                    <Card isSelected={selectedRole === 'teacher'}>
                        <div className="flex flex-col items-center">
                            <IconWrapper>
                                <Crown className="w-8 h-8 text-primary" />
                            </IconWrapper>
                            <h2 className="text-xl font-semibold mt-6 mb-2">Teacher</h2>
                            <p className="text-secondary">Create & manage polls</p>
                        </div>
                    </Card>
                </button>
                <button 
                    onClick={() => handleRoleSelect('student')}
                    className="role-card"
                >
                    <Card isSelected={selectedRole === 'student'}>
                        <div className="flex flex-col items-center">
                            <IconWrapper>
                                <User className="w-8 h-8 text-primary" />
                            </IconWrapper>
                            <h2 className="text-xl font-semibold mt-6 mb-2">Student</h2>
                            <p className="text-secondary">Participate in polls</p>
                        </div>
                    </Card>
                </button>
            </div>
        </div>
    );
}

function NameInput({ role, name, setName, onSubmit, inputRef }) {
    return (
        <div className="container animate-fade-in">
            <Card className="max-w-[480px] mx-auto">
                <form onSubmit={onSubmit} className="text-center">
                    <IconWrapper>
                        {role === 'teacher' ? 
                            <Crown className="w-8 h-8 text-primary" /> : 
                            <User className="w-8 h-8 text-primary" />
                        }
                    </IconWrapper>
                    <h1 className="heading-main mt-6 mb-2">Joining as a {role}</h1>
                    <p className="heading-sub mb-8">Please enter your name to continue.</p>
                    <input
                        ref={inputRef}
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Your Name"
                        className="input mb-6"
                    />
                    <Button 
                        type="submit" 
                        className="w-full" 
                        disabled={!name.trim()}
                    >
                        Join Session
                    </Button>
                </form>
            </Card>
        </div>
    );
}

function TeacherDashboard({ name, users, poll, results, timer, pollHistory, onCreatePoll, onRemoveStudent }) {
    return (
        <div className="container">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                     <PollControl onCreatePoll={onCreatePoll} isActive={poll.isActive} />
                     <CurrentPollDisplay poll={poll} results={results} timer={timer} />
                </div>
                <div className="space-y-6">
                     <UsersPanel users={users} onRemoveStudent={onRemoveStudent} />
                     <HistoryPanel pollHistory={pollHistory} />
                </div>
            </div>
        </div>
    );
}

function PollControl({ onCreatePoll, isActive }) {
    const [question, setQuestion] = useState('');
    const [options, setOptions] = useState(['', '']);
    const [timer, setTimer] = useState(60);

    const handleAddOption = () => setOptions([...options, '']);
    const handleRemoveOption = (index) => setOptions(options.filter((_, i) => i !== index));
    const handleOptionChange = (index, value) => {
        const newOptions = [...options];
        newOptions[index] = value;
        setOptions(newOptions);
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        const validOptions = options.map(o => o.trim()).filter(o => o !== '');
        if (question.trim() && validOptions.length >= 2) {
            onCreatePoll({ question, options: validOptions, timer });
            setQuestion('');
            setOptions(['', '']);
        } else {
            alert('Please provide a question and at least two valid options.');
        }
    };
    
    if (isActive) {
        return (
            <Card className="text-center">
                <h2 className="text-2xl font-bold mb-2">Poll is Live!</h2>
                <p className="text-gray-500 dark:text-gray-400">Waiting for students to respond. Results will update in real-time below.</p>
            </Card>
        );
    }
    
    return (
        <Card>
            <h2 className="text-2xl font-bold mb-4">Create a New Poll</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
                <input type="text" placeholder="Poll Question" value={question} onChange={(e) => setQuestion(e.target.value)} className="w-full p-3 bg-gray-100 dark:bg-gray-700 rounded-lg"/>
                <div>
                    <label className="block mb-2 font-semibold">Options</label>
                    {options.map((opt, i) => (
                        <div key={i} className="flex items-center gap-2 mb-2">
                            <input type="text" placeholder={`Option ${i+1}`} value={opt} onChange={(e) => handleOptionChange(i, e.target.value)} className="w-full p-3 bg-gray-100 dark:bg-gray-700 rounded-lg"/>
                            {options.length > 2 && <button type="button" onClick={() => handleRemoveOption(i)}><XCircle className="w-6 h-6 text-red-500"/></button>}
                        </div>
                    ))}
                    <Button type="button" variant="secondary" onClick={handleAddOption} className="text-sm !py-2 !px-4">Add Option</Button>
                </div>
                 <div>
                    <label className="block mb-2 font-semibold">Time Limit (seconds)</label>
                    <input type="number" value={timer} onChange={(e) => setTimer(parseInt(e.target.value, 10))} className="w-full p-3 bg-gray-100 dark:bg-gray-700 rounded-lg"/>
                </div>
                <Button type="submit" className="w-full">Start Poll</Button>
            </form>
        </Card>
    );
}

function UsersPanel({ users, onRemoveStudent }) {
    const teacher = users.find(u => u.role === 'teacher');
    const students = users.filter(u => u.role === 'student');

    return (
        <Card>
            <h2 className="text-xl font-bold mb-4">Participants ({users.length})</h2>
            <div className="space-y-3 max-h-96 overflow-y-auto">
                {teacher && <div className="flex items-center gap-3 p-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
                    <Crown className="w-5 h-5 text-blue-500" />
                    <span className="font-bold">{teacher.name} (Teacher)</span>
                </div>}
                {students.map((student, i) => (
                     <div key={i} className="flex items-center justify-between gap-3 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
                        <div className="flex items-center gap-3">
                            <User className="w-5 h-5 text-green-500" />
                            <span>{student.name}</span>
                        </div>
                        <button onClick={() => onRemoveStudent(student.socketId)} title={`Remove ${student.name}`} className="text-gray-400 hover:text-red-500">
                            <Trash2 className="w-5 h-5"/>
                        </button>
                    </div>
                ))}
            </div>
        </Card>
    );
}

function HistoryPanel({ pollHistory }) {
    const [selectedPoll, setSelectedPoll] = useState(null);

    // Calculate total votes for a poll
    const getTotalVotes = (results) => results.reduce((sum, item) => sum + item.votes, 0);

    return (
        <Card>
            <h2 className="text-xl font-bold mb-4">Poll History</h2>
            {pollHistory.length === 0 ? <p className="text-gray-500">No polls yet.</p> : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                    {pollHistory.map((poll, i) => {
                        const totalVotes = getTotalVotes(poll.results);
                        return (
                            <div 
                                key={i} 
                                onClick={() => setSelectedPoll(poll)} 
                                className="p-4 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-all duration-200"
                            >
                                <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                        <p className="font-semibold">{poll.question}</p>
                                        <p className="text-sm text-gray-500 mt-1">
                                            {new Date(poll.endedAt).toLocaleString()}
                                        </p>
                                    </div>
                                    <span className="text-sm font-medium text-primary ml-4">
                                        {totalVotes} {totalVotes === 1 ? 'response' : 'responses'}
                                    </span>
                                </div>
                                {/* Preview of results */}
                                <div className="mt-2 space-y-1">
                                    {poll.results.map((result, idx) => (
                                        <div key={idx} className="text-sm">
                                            <div className="flex justify-between mb-1">
                                                <span className="text-gray-600 dark:text-gray-400 truncate pr-2">
                                                    {result.text}
                                                </span>
                                                <span className="text-gray-900 dark:text-gray-100 font-medium">
                                                    {totalVotes > 0 ? Math.round((result.votes / totalVotes) * 100) : 0}%
                                                </span>
                                            </div>
                                            <div className="w-full h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                                <div 
                                                    className="h-full bg-primary rounded-full transition-all duration-500"
                                                    style={{ 
                                                        width: `${totalVotes > 0 ? (result.votes / totalVotes) * 100 : 0}%`,
                                                        opacity: 0.7
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
            {/* Detailed Modal View */}
            {selectedPoll && (
                <div 
                    className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" 
                    onClick={() => setSelectedPoll(null)}
                >
                    <Card className="w-full max-w-2xl" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-start mb-6">
                            <div>
                                <h3 className="text-2xl font-bold">{selectedPoll.question}</h3>
                                <p className="text-gray-500 mt-1">
                                    Ended {new Date(selectedPoll.endedAt).toLocaleString()}
                                </p>
                                <p className="text-primary font-medium mt-2">
                                    {getTotalVotes(selectedPoll.results)} total responses
                                </p>
                            </div>
                            <button 
                                onClick={() => setSelectedPoll(null)}
                                className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                            >
                                <XCircle className="w-6 h-6" />
                            </button>
                        </div>
                        
                        {/* Bar Chart */}
                        <div className="mb-6">
                            <ResultsChart data={selectedPoll.results} />
                        </div>
                        
                        {/* Detailed Results Table */}
                        <div className="border rounded-lg overflow-hidden">
                            <table className="w-full">
                                <thead className="bg-gray-50 dark:bg-gray-800">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Option</th>
                                        <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">Votes</th>
                                        <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">Percentage</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {selectedPoll.results.map((result, idx) => {
                                        const percentage = getTotalVotes(selectedPoll.results) > 0
                                            ? ((result.votes / getTotalVotes(selectedPoll.results)) * 100).toFixed(1)
                                            : 0;
                                        return (
                                            <tr key={idx} className="border-t">
                                                <td className="px-4 py-3 text-sm">{result.text}</td>
                                                <td className="px-4 py-3 text-sm text-right">{result.votes}</td>
                                                <td className="px-4 py-3 text-sm text-right">{percentage}%</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                </div>
            )}
        </Card>
    );
}

function StudentDashboard({ name, poll, results, timer, hasVoted, onVote }) {
    const showResults = hasVoted || !poll.isActive;
    
    return (
        <div className="container">
            <Card className="max-w-3xl mx-auto">
                <h1 className="text-2xl font-bold mb-1">Welcome, {name}!</h1>
                {!poll.isActive && results.length === 0 && <p className="text-gray-500 text-center py-16">Waiting for the teacher to start a poll...</p>}

                {poll.isActive && !hasVoted && (
                    <div className="text-center">
                        <p className="text-gray-500 mb-2">Poll in Progress</p>
                        <div className="flex items-center justify-center gap-2 text-2xl font-bold text-red-500 mb-4">
                            <Clock className="w-6 h-6"/>
                            <span>{timer}s</span>
                        </div>
                        <h2 className="text-3xl font-bold mb-6">{poll.question}</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {poll.options.map((opt, i) => (
                                <Button key={i} onClick={() => onVote(i)} className="text-lg !py-4">{opt}</Button>
                            ))}
                        </div>
                    </div>
                )}

                {showResults && poll.question && (
                     <CurrentPollDisplay poll={poll} results={results} timer={timer} isStudentView={true} />
                )}
            </Card>
        </div>
    );
}

function CurrentPollDisplay({ poll, results, timer, isStudentView = false }) {
    if (!poll.question) {
        if (!isStudentView) return <Card className="text-center"><p className="text-gray-500">No active poll. Create one to get started!</p></Card>;
        return null;
    }

    return (
        <Card>
            <div className="flex justify-between items-start mb-4">
                <div>
                    <p className="text-sm text-gray-500">{poll.isActive ? "Live Poll" : "Final Results"}</p>
                    <h2 className="text-2xl font-bold">{poll.question}</h2>
                </div>
                {poll.isActive && (
                    <div className="flex items-center gap-2 font-bold text-red-500 bg-red-100 dark:bg-red-900/30 px-3 py-1 rounded-full">
                        <Clock className="w-5 h-5"/>
                        <span>{timer}s</span>
                    </div>
                )}
            </div>
            {results.length > 0 ? <ResultsChart data={results} /> : <p className="text-center text-gray-500 py-8">Waiting for first vote...</p>}
        </Card>
    );
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#AF19FF', '#FF4560'];

function ResultsChart({ data }) {
    const totalVotes = data.reduce((sum, item) => sum + item.votes, 0);
    const chartData = data.map(item => ({
        name: item.text,
        votes: item.votes,
        percentage: totalVotes > 0 ? ((item.votes / totalVotes) * 100).toFixed(1) : 0,
    }));

    return (
        <div className="w-full h-80">
            <ResponsiveContainer>
                <BarChart data={chartData} layout="vertical" margin={{ top: 20, right: 30, left: 30, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(128, 128, 128, 0.2)" />
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="name" width={100} tickLine={false} axisLine={false} />
                    <Tooltip 
                        cursor={{fill: 'rgba(240, 240, 240, 0.2)'}}
                        contentStyle={{
                            background: "rgba(30, 41, 59, 0.9)",
                            borderColor: "rgba(128, 128, 128, 0.5)",
                            borderRadius: "10px"
                        }}
                    />
                    <Bar dataKey="votes" barSize={40} label={{ position: 'right', fill: '#fff', formatter: (value, entry) => `${value} (${chartData.find(d => d.name === entry.name)?.percentage}%)` }}>
                        {chartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}