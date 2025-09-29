import React, { useState, useEffect, useRef } from 'react';
import { MessageCircle, X, Send, User, Crown } from 'lucide-react';

export default function ChatPopup({ socket, user, users, isOpen, onClose }) {
    const [message, setMessage] = useState('');
    const [messages, setMessages] = useState([]);
    const [selectedRecipient, setSelectedRecipient] = useState(null);
    const messagesEndRef = useRef(null);

    // Request chat history when component mounts
    useEffect(() => {
        if (socket) {
            socket.emit('chat:request-history');
        }
    }, [socket]);

    // Listen for chat messages
    useEffect(() => {
        if (!socket) return;

        socket.on('server:chat-message', (message) => {
            setMessages(prev => [...prev, message]);
        });

        socket.on('server:chat-history', (history) => {
            setMessages(history);
        });

        return () => {
            socket.off('server:chat-message');
            socket.off('server:chat-history');
        };
    }, [socket]);

    // Auto-scroll to bottom when new messages arrive
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSendMessage = (e) => {
        e.preventDefault();
        if (!message.trim()) return;

        socket.emit('chat:send-message', {
            message: message.trim(),
            recipientId: selectedRecipient?.socketId || null
        });

        setMessage('');
    };

    // Filter messages based on selected recipient
    const filteredMessages = messages.filter(msg => 
        !selectedRecipient || 
        msg.senderId === selectedRecipient.socketId || 
        msg.recipientId === selectedRecipient.socketId ||
        msg.senderId === socket.id ||
        msg.recipientId === socket.id
    );

    if (!isOpen) return null;

    return (
        <div className="fixed bottom-4 right-4 w-96 bg-white dark:bg-gray-800 rounded-lg shadow-xl overflow-hidden flex flex-col" style={{ height: '500px' }}>
            {/* Header */}
            <div className="bg-blue-600 dark:bg-blue-800 text-white p-4 flex justify-between items-center">
                <div className="flex items-center gap-2">
                    <MessageCircle className="w-5 h-5" />
                    <span className="font-bold">Chat</span>
                </div>
                <button onClick={onClose} className="text-white hover:text-gray-200">
                    <X className="w-5 h-5" />
                </button>
            </div>

            {/* Recipient selector */}
            <div className="p-2 border-b dark:border-gray-700">
                <select 
                    value={selectedRecipient ? selectedRecipient.socketId : ''} 
                    onChange={(e) => {
                        const recipient = users.find(u => u.socketId === e.target.value);
                        setSelectedRecipient(recipient || null);
                    }}
                    className="w-full p-2 rounded bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200"
                >
                    <option value="">Everyone</option>
                    {users
                        .filter(u => u.socketId !== socket.id)
                        .map(u => (
                            <option key={u.socketId} value={u.socketId}>
                                {u.name} ({u.role})
                            </option>
                        ))
                    }
                </select>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {filteredMessages.map((msg) => (
                    <div 
                        key={msg.id}
                        className={`flex gap-2 ${msg.senderId === socket.id ? 'justify-end' : 'justify-start'}`}
                    >
                        <div 
                            className={`max-w-[80%] rounded-lg p-3 ${
                                msg.senderId === socket.id 
                                    ? 'bg-blue-600 text-white' 
                                    : 'bg-gray-100 dark:bg-gray-700'
                            }`}
                        >
                            <div className="flex items-center gap-2 mb-1">
                                {msg.senderRole === 'teacher' ? (
                                    <Crown className="w-4 h-4" />
                                ) : (
                                    <User className="w-4 h-4" />
                                )}
                                <span className="font-bold">{msg.senderName}</span>
                                {msg.recipientId && (
                                    <span className="text-sm opacity-75">
                                        → {users.find(u => u.socketId === msg.recipientId)?.name || 'Unknown'}
                                    </span>
                                )}
                            </div>
                            <p>{msg.message}</p>
                            <div className="text-xs opacity-75 mt-1">
                                {new Date(msg.timestamp).toLocaleTimeString()}
                            </div>
                        </div>
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>

            {/* Message input */}
            <form onSubmit={handleSendMessage} className="p-4 border-t dark:border-gray-700">
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder={`Message ${selectedRecipient ? selectedRecipient.name : 'everyone'}...`}
                        className="flex-1 p-2 rounded bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200"
                    />
                    <button 
                        type="submit"
                        disabled={!message.trim()}
                        className="p-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                    >
                        <Send className="w-5 h-5" />
                    </button>
                </div>
            </form>
        </div>
    );
}