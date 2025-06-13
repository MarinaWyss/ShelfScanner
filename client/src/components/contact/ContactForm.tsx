import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface ContactFormProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ContactForm({ isOpen, onClose }: ContactFormProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Create a mailto URL with the form data
      const mailtoUrl = `mailto:shelfscannerapp@gmail.com?subject=ShelfScanner Contact: ${encodeURIComponent(name)}&body=${encodeURIComponent(`Name: ${name}\nEmail: ${email}\n\n${message}`)}`;
      
      // Open the user's email client
      window.location.href = mailtoUrl;
      
      // Show success message
      toast({
        title: "Email client opened",
        description: "Please send the email from your email client to contact us.",
      });
      
      // Reset form
      setName('');
      setEmail('');
      setMessage('');
      
    } catch {
      toast({
        title: "Failed to open email client",
        description: "Please contact us directly at shelfscannerapp@gmail.com",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={`fixed inset-y-0 right-0 w-full sm:w-96 bg-white dark:bg-gray-900 border-l border-neutral-200 dark:border-gray-700 shadow-lg z-30 flex flex-col transition-transform duration-300 ${
      isOpen ? 'translate-x-0' : 'translate-x-full'
    }`}>
      <div className="flex items-center justify-between border-b border-neutral-200 dark:border-gray-700 p-4">
        <h3 className="font-semibold text-neutral-800 dark:text-white">Contact Us</h3>
        <Button variant="ghost" size="icon" onClick={onClose} className="text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white">
          <X className="h-5 w-5" />
        </Button>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4">
        <p className="text-neutral-600 dark:text-neutral-300 mb-4">
          Have questions or suggestions about ShelfScanner? Send us a message and we'll get back to you as soon as possible.
        </p>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
              Name
            </label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 text-neutral-800 dark:text-white bg-white dark:bg-gray-900"
              placeholder="Your name"
              required
            />
          </div>
          
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
              Email
            </label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 text-neutral-800 dark:text-white bg-white dark:bg-gray-900"
              placeholder="your.email@example.com"
              required
            />
          </div>
          
          <div>
            <label htmlFor="message" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
              Message
            </label>
            <textarea
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 text-neutral-800 dark:text-white bg-white dark:bg-gray-900"
              placeholder="How can we help you?"
              required
            />
          </div>
          
          <Button 
            type="submit" 
            className="w-full bg-violet-600 hover:bg-violet-700 dark:bg-violet-600 dark:hover:bg-violet-500 text-white"
            disabled={isSubmitting || !name || !email || !message}
          >
            {isSubmitting ? 'Sending...' : 'Send Message'}
          </Button>
        </form>
      </div>
      
      <div className="border-t border-neutral-200 dark:border-neutral-700 p-4 text-center text-sm text-neutral-500 dark:text-neutral-400">
        You can also email us directly at{' '}
        <a 
          href="mailto:shelfscannerapp@gmail.com" 
          className="text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300"
        >
          shelfscannerapp@gmail.com
        </a>
      </div>
    </div>
  );
}