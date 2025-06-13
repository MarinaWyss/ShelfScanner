import { X, Heart, Coffee, Gift } from "lucide-react";

interface DonationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function DonationModal({ isOpen, onClose }: DonationModalProps) {

  if (!isOpen) {
    return null;
  }

  const handleDonate = () => {
    // Open PayPal donation link in new tab
    window.open(
      "https://www.paypal.com/donate/?business=S8Z878CBE5F3U&no_recurring=0&item_name=Thanks+for+supporting+ShelfScanner%21&currency_code=USD",
      "_blank",
      "noopener,noreferrer"
    );
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full relative overflow-hidden">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors z-10"
        >
          <X className="h-6 w-6" />
        </button>

        {/* Header with cute illustration */}
        <div className="bg-gradient-to-br from-pink-100 to-purple-100 dark:from-pink-900/30 dark:to-purple-900/30 p-8 text-center">
          <div className="mb-4 flex justify-center">
            <div className="bg-white dark:bg-gray-700 rounded-full p-4 shadow-lg">
              <Heart className="h-8 w-8 text-pink-500 fill-current" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Support ShelfScanner
          </h2>
          <p className="text-gray-600 dark:text-gray-300 text-sm">
            Help us keep the book recommendations flowing! ✨
          </p>
        </div>

        {/* Content */}
        <div className="p-6">
          <div className="text-center mb-6">
            <div className="flex justify-center items-center gap-2 mb-3">
              <Coffee className="h-5 w-5 text-amber-500" />
              <span className="text-gray-700 dark:text-gray-300 font-medium">
                Buy us a coffee!
              </span>
              <Coffee className="h-5 w-5 text-amber-500" />
            </div>
            <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
              Your support helps us maintain our servers, improve our AI recommendations, 
              and keep ShelfScanner free for book lovers everywhere! 📚
            </p>
          </div>



          {/* Action buttons */}
          <div className="space-y-3">
            <button
              onClick={handleDonate}
              className="w-full bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white font-semibold py-3 px-6 rounded-lg transition-all transform hover:scale-105 shadow-lg flex items-center justify-center gap-2"
            >
              <Gift className="h-5 w-5" />
              Donate with PayPal
            </button>
            
            <button
              onClick={onClose}
              className="w-full text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 font-medium py-2 transition-colors"
            >
              Maybe later
            </button>
          </div>

          {/* Thank you note */}
          <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg text-center">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              <span className="font-medium">Thank you</span> for considering a donation! 
              Every contribution, no matter the size, means the world to us. 💝
            </p>
          </div>
        </div>
      </div>
    </div>
  );
} 