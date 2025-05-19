import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { X, Send } from "lucide-react";

interface ChatMessage {
  sender: 'user' | 'ai';
  content: string;
}

interface ChatOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ChatOverlay({ isOpen, onClose }: ChatOverlayProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { 
      sender: 'ai', 
      content: 'Hello! I\'m your book assistant. Ask me anything about book recommendations or help identifying books from your shelf.' 
    }
  ]);
  const [currentMessage, setCurrentMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleSendMessage = () => {
    if (currentMessage.trim() === '') return;
    
    // Add user message
    setMessages([...messages, { sender: 'user', content: currentMessage }]);
    
    // Generate AI response
    setTimeout(() => {
      let aiResponse = '';
      
      if (currentMessage.toLowerCase().includes('book') || currentMessage.toLowerCase().includes('recommend')) {
        aiResponse = 'Based on your reading preferences, I recommend checking out "The Design of Everyday Things" by Don Norman. It aligns well with your interest in design and non-fiction books.';
      } else if (currentMessage.toLowerCase().includes('how') && currentMessage.toLowerCase().includes('work')) {
        aiResponse = 'Our app uses computer vision technology to identify books from your bookshelf photos. Then we match those books with your preferences to provide personalized recommendations. The more books you scan, the better our recommendations get!';
      } else if (currentMessage.toLowerCase().includes('genre')) {
        aiResponse = 'We currently support many genres including Fiction, Non-Fiction, Science Fiction, Mystery, Romance, Science, History, Business, Self-Help, and more. You can select multiple genres in your preferences.';
      } else {
        aiResponse = 'I\'m here to help with book-related questions. You can ask me about recommendations, how our app works, or for help with scanning your books.';
      }
      
      setMessages(prev => [...prev, { sender: 'ai', content: aiResponse }]);
    }, 1000);
    
    setCurrentMessage('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-full sm:w-96 bg-white border-l border-neutral-200 shadow-lg z-30 flex flex-col transition-transform duration-300">
      <div className="flex items-center justify-between border-b border-neutral-200 p-4">
        <h3 className="font-semibold text-neutral-800">Book Assistant</h3>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-5 w-5" />
        </Button>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message, index) => (
          <div 
            key={index} 
            className={`flex ${message.sender === 'ai' ? '' : 'justify-end'}`}
          >
            <div 
              className={`rounded-lg p-3 max-w-[80%] ${
                message.sender === 'ai' 
                  ? 'bg-neutral-100 text-neutral-800' 
                  : 'bg-primary-600 text-white'
              }`}
            >
              <p className="text-sm">{message.content}</p>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      
      <div className="border-t border-neutral-200 p-4">
        <div className="flex items-center">
          <input 
            type="text" 
            value={currentMessage}
            onChange={(e) => setCurrentMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about books or recommendations..." 
            className="flex-1 border border-neutral-300 rounded-l-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
          <Button 
            onClick={handleSendMessage}
            className="rounded-l-none"
            disabled={currentMessage.trim() === ''}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        
        <div className="mt-3">
          <p className="text-xs text-neutral-500">
            Suggested: "What books would you recommend?", "How does the book scanner work?", "What genres do you support?"
          </p>
        </div>
      </div>
    </div>
  );
}
