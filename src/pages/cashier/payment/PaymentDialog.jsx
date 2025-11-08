import React, { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useSelector, useDispatch } from "react-redux";
import {
  selectCartItems,
  selectNote,
  selectPaymentMethod,
  selectSelectedCustomer,
  selectTotal,
  setCurrentOrder,
  setPaymentMethod,
} from "../../../Redux Toolkit/features/cart/cartSlice";
import { useToast } from "../../../components/ui/use-toast";
import { createOrder } from "../../../Redux Toolkit/features/order/orderThunks";
import { paymentMethods } from "./data";
import { CreditCard, Banknote, Smartphone, Loader2 } from "lucide-react";
import { v4 as uuidv4 } from "uuid";

const paymentIcons = {
  CASH: Banknote,
  CARD: CreditCard,
  UPI: Smartphone,
};

const PaymentDialog = ({
  showPaymentDialog,
  setShowPaymentDialog,
  setShowReceiptDialog,
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(0);

  const paymentMethod = useSelector(selectPaymentMethod);
  const cart = useSelector(selectCartItems);
  const branch = useSelector((state) => state.branch);
  const { userProfile } = useSelector((state) => state.user);
  const selectedCustomer = useSelector(selectSelectedCustomer);
  const total = useSelector(selectTotal);
  const note = useSelector(selectNote);

  const { toast } = useToast();
  const dispatch = useDispatch();
  const buttonRefs = useRef([]);

  // Validate order before sending
  const validateOrder = () => {
    if (cart.length === 0) {
      toast({
        title: "Empty Cart",
        description: "Please add items before processing payment",
        variant: "destructive",
      });
      return false;
    }
    if (!selectedCustomer) {
      toast({
        title: "Customer Required",
        description: "Please select a customer",
        variant: "destructive",
      });
      return false;
    }
    if (!paymentMethod) {
      toast({
        title: "Payment Method Required",
        description: "Please choose a payment method",
        variant: "destructive",
      });
      return false;
    }
    return true;
  };

  // Process payment
  const processPayment = async () => {
    if (!validateOrder()) return;

    const orderData = {
      idempotencyKey: uuidv4(), // unique key for idempotency
      totalAmount: total,
      branchId: branch.id,
      cashierId: userProfile.id,
      customer: selectedCustomer,
      items: cart.map((item) => ({
        productId: item.id,
        quantity: item.quantity,
        price: item.price,
        total: item.price * item.quantity,
      })),
      paymentType: paymentMethod,
      note: note || "",
    };

    setIsProcessing(true);

    try {
      const createdOrder = await dispatch(createOrder(orderData)).unwrap();
      dispatch(setCurrentOrder(createdOrder));
      toast({
        title: "Order Created Successfully",
        description: `Order #${createdOrder.id} created.`,
      });
      setShowPaymentDialog(false);
      setShowReceiptDialog(true);
    } catch (error) {
      toast({
        title: "Order Creation Failed",
        description: error?.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Auto-select CASH on dialog open
  useEffect(() => {
    if (showPaymentDialog) {
      dispatch(setPaymentMethod("CASH"));
      setFocusedIndex(0);
    }
  }, [showPaymentDialog, dispatch]);

  // Keyboard navigation
  useEffect(() => {
    if (!showPaymentDialog) return;

    let enableKeys = false;
    const timer = setTimeout(() => (enableKeys = true), 300);

    const handleKeyDown = (e) => {
      if (!enableKeys || isProcessing) return;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setFocusedIndex((prev) => {
            const newIndex = (prev + 1) % paymentMethods.length;
            dispatch(setPaymentMethod(paymentMethods[newIndex].key));
            return newIndex;
          });
          break;

        case "ArrowUp":
          e.preventDefault();
          setFocusedIndex((prev) => (prev === 0 ? paymentMethods.length - 1 : prev - 1));
          dispatch(setPaymentMethod(paymentMethods[focusedIndex].key));
          break;

        case "Enter":
          e.preventDefault();
          if (!isProcessing) processPayment();
          break;

        case "Escape":
          e.preventDefault();
          handleCancel();
          break;

        default:
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [showPaymentDialog, isProcessing, focusedIndex, paymentMethod]);

  // Focus button when navigating
  useEffect(() => {
    if (buttonRefs.current[focusedIndex] && showPaymentDialog) {
      buttonRefs.current[focusedIndex]?.focus();
    }
  }, [focusedIndex, showPaymentDialog]);

  const handlePaymentMethod = (method, index) => {
    dispatch(setPaymentMethod(method));
    setFocusedIndex(index);
  };

  const handleCancel = () => {
    if (!isProcessing) setShowPaymentDialog(false);
  };

  return (
    <Dialog open={showPaymentDialog} onOpenChange={handleCancel}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Select Payment Method</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div className="text-center p-4 bg-green-50 rounded-lg border border-green-200">
            <div className="text-4xl font-bold text-green-600">Rs. {total.toFixed(2)}</div>
            <p className="text-sm text-gray-600 mt-1">Total Amount</p>
          </div>

          {selectedCustomer && (
            <div className="text-sm text-gray-600 p-3 bg-gray-50 rounded-lg">
              <span className="font-medium">Customer:</span> {selectedCustomer.name || selectedCustomer.email}
            </div>
          )}

          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-700 mb-3">
              Choose Payment Method (↑↓ arrows, Enter to confirm)
            </p>
            {paymentMethods.map((method, index) => {
              const Icon = paymentIcons[method.key];
              const isSelected = paymentMethod === method.key;
              const isFocused = focusedIndex === index;

              return (
                <Button
                  key={method.key}
                  ref={(el) => (buttonRefs.current[index] = el)}
                  variant={isSelected ? "default" : "outline"}
                  className={`w-full justify-start gap-3 h-12 text-base transition-all ${
                    isFocused ? "ring-2 ring-offset-2 ring-primary" : ""
                  }`}
                  onClick={() => handlePaymentMethod(method.key, index)}
                  disabled={isProcessing}
                  tabIndex={isFocused ? 0 : -1}
                >
                  {Icon && <Icon className="h-5 w-5" />}
                  <span>{method.label}</span>
                  {isSelected && (
                    <span className="ml-auto text-xs bg-white/20 px-2 py-1 rounded">Selected</span>
                  )}
                </Button>
              );
            })}
          </div>

          <div className="text-xs text-gray-500 text-center space-y-1">
            <p>
              Press <kbd className="px-2 py-1 bg-gray-100 rounded">Enter</kbd> to
              complete payment
            </p>
            <p>
              Press <kbd className="px-2 py-1 bg-gray-100 rounded">Esc</kbd> to cancel
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleCancel} disabled={isProcessing}>
            Cancel (Esc)
          </Button>
          <Button onClick={processPayment} disabled={isProcessing || !paymentMethod} className="gap-2">
            {isProcessing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Processing...
              </>
            ) : (
              "Complete Payment (Enter)"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PaymentDialog;
