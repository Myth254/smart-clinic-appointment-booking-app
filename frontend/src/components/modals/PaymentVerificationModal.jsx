import React, { useState, useEffect } from 'react';
import { X, CreditCard, Smartphone, CheckCircle, Loader, AlertCircle, Info } from 'lucide-react';
import { paymentsAPI } from '../../api';
import toast from 'react-hot-toast';

const PaymentVerificationModal = ({ isOpen, onClose, paymentData, onSuccess }) => {
  const [step, setStep] = useState('confirm'); // confirm, processing, success, failed
  const [phoneNumber, setPhoneNumber] = useState('');
  const [checkoutRequestId, setCheckoutRequestId] = useState(null);
  const [transactionId, setTransactionId] = useState(null);
  const [error, setError] = useState('');
  const [pollingCount, setPollingCount] = useState(0);

  useEffect(() => {
    if (!isOpen) return;

    setStep('confirm');
    setCheckoutRequestId(null);
    setTransactionId(null);
    setError('');
    setPollingCount(0);
    setPhoneNumber(
      paymentData?.defaultPhone
        ? paymentsAPI.formatPhoneNumber(paymentData.defaultPhone)
        : ''
    );
  }, [isOpen, paymentData]);

  useEffect(() => {
    if (step === 'processing' && checkoutRequestId) {
      // Poll for payment status every 3 seconds for up to 60 seconds
      const interval = setInterval(async () => {
        if (pollingCount >= 20) {
          setStep('failed');
          setError('Payment timeout. Please try again or check your M-Pesa messages.');
          clearInterval(interval);
          return;
        }

        try {
          const response = await paymentsAPI.queryMpesaTransaction(checkoutRequestId);

          const payment = response.data?.payment;

          if (payment?.status === 'completed') {
            setTransactionId(
              payment.mpesaReceiptNumber ||
              payment.mpesaTransactionId ||
              payment.receiptNumber ||
              payment._id
            );
            setStep('success');
            clearInterval(interval);

            setTimeout(() => {
              onSuccess(response.data);
              onClose();
            }, 2000);
          } else if (['failed', 'cancelled'].includes(payment?.status)) {
            setStep('failed');
            setError(payment.resultDescription || 'Payment was not completed');
            clearInterval(interval);
          }

          setPollingCount(prev => prev + 1);
        } catch (err) {
          console.error('Payment status check failed:', err);
          setPollingCount(prev => prev + 1);
        }
      }, 3000);

      return () => clearInterval(interval);
    }
  }, [step, checkoutRequestId, pollingCount, onSuccess, onClose]);

  const handleConfirm = async () => {
    // Validate phone number
    if (!paymentsAPI.validatePhoneNumber(phoneNumber)) {
      toast.error('Please enter a valid Kenyan phone number (07XX XXX XXX or +254...)');
      return;
    }

    setError('');
    setStep('processing');

    try {
      // ✅ PRIMARY: consolidated Bill payment — sends billId so the backend
      //    runs BillCalculator.applyPayment() on the M-Pesa callback.
      // LEGACY: individual lab / prescription — sends amount + referenceId + type.
      const isBillPayment = !!paymentData?.billId;

      const payload = isBillPayment
        ? {
            billId:      paymentData.billId,
            phoneNumber: phoneNumber,
          }
        : {
            amount:      paymentData.amount,
            phoneNumber: phoneNumber,
            referenceId: paymentData.referenceId,
            type:        paymentData.type,
            description: paymentData.description,
          };

      const response = await paymentsAPI.initiateMpesaPayment(payload);

      if (response.success || response.data?.checkoutRequestId) {
        setCheckoutRequestId(response.data?.checkoutRequestId || response.checkoutRequestId);
        toast.success('Payment request sent! Check your phone for M-Pesa prompt.');
      } else {
        setStep('failed');
        setError(response.message || 'Failed to initiate payment');
      }
    } catch (err) {
      setStep('failed');
      setError(err.response?.data?.message || 'Failed to initiate payment. Please try again.');
    }
  };

  const handleRetry = () => {
    setStep('confirm');
    setError('');
    setPollingCount(0);
    setCheckoutRequestId(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/20 backdrop-blur-md p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">Payment Confirmation</h3>
              <p className="text-sm text-gray-500">M-Pesa Payment</p>
            </div>
          </div>
          {step !== 'processing' && (
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="p-6">
          {step === 'confirm' && (
            <>
              {/* Payment Details */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-gray-600">Amount to Pay:</span>
                  <span className="text-2xl font-bold text-gray-900">
                    KES {(paymentData?.amount || paymentData?.balanceDue)?.toLocaleString()}
                  </span>
                </div>
                {paymentData?.billId ? (
                  <>
                    <div className="flex justify-between items-center text-sm mb-1">
                      <span className="text-gray-600">Bill:</span>
                      <span className="font-mono font-medium text-gray-900">{paymentData.billNumber}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-600">For:</span>
                      <span className="text-gray-900 font-medium">{paymentData.description}</span>
                    </div>
                  </>
                ) : (
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-600">For:</span>
                    <span className="text-gray-900 font-medium">{paymentData?.description}</span>
                  </div>
                )}
                {paymentData?.itemDetails && (
                  <div className="mt-2 text-xs text-gray-500">
                    {paymentData.itemDetails}
                  </div>
                )}
              </div>

              {/* Phone Number Input */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  M-Pesa Phone Number
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Smartphone className="w-5 h-5 text-gray-400" />
                  </div>
                  <input
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="0712345678 or +254712345678"
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Enter the phone number registered with M-Pesa
                </p>
              </div>

              {/* Info Box */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <div className="flex items-start space-x-3">
                  <Info className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-blue-800">
                    <p className="font-medium mb-1">How it works:</p>
                    <ul className="space-y-1 text-xs">
                      <li>• You'll receive an M-Pesa prompt on your phone</li>
                      <li>• Enter your M-Pesa PIN to complete payment</li>
                      <li>• Payment confirmation is instant</li>
                    </ul>
                  </div>
                </div>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex space-x-3">
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirm}
                  className="flex-1 px-4 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors"
                >
                  Proceed to Pay
                </button>
              </div>
            </>
          )}

          {step === 'processing' && (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Loader className="w-8 h-8 text-green-600 animate-spin" />
              </div>
              <h4 className="text-lg font-semibold mb-2">Processing Payment</h4>
              <p className="text-gray-600 mb-4">
                Check your phone for the M-Pesa prompt
              </p>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                <p className="text-sm text-yellow-800">
                  Enter your M-Pesa PIN on your phone to complete the payment
                </p>
              </div>
              <p className="text-xs text-gray-500">
                Waiting for confirmation... ({pollingCount * 3}s)
              </p>
            </div>
          )}

          {step === 'success' && (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <h4 className="text-lg font-semibold text-green-600 mb-2">
                Payment Successful!
              </h4>
              <p className="text-gray-600 mb-4">
                Your payment has been received and confirmed
              </p>
              {transactionId && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-4">
                  <p className="text-xs text-gray-600 mb-1">Transaction ID</p>
                  <p className="text-sm font-mono font-semibold text-gray-900">
                    {transactionId}
                  </p>
                </div>
              )}
              <p className="text-sm text-gray-500">
                You will receive an M-Pesa confirmation message shortly
              </p>
            </div>
          )}

          {step === 'failed' && (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-8 h-8 text-red-600" />
              </div>
              <h4 className="text-lg font-semibold text-red-600 mb-2">
                Payment Failed
              </h4>
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                <p className="text-sm text-red-800">{error}</p>
              </div>
              <div className="flex space-x-3">
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRetry}
                  className="flex-1 px-4 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors"
                >
                  Try Again
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PaymentVerificationModal;
