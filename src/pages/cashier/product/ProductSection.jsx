// FULL UPDATED ProductSection WITH PREFIX NAME FILTER + 9-DIGIT SCALE MODE + 10-DIGIT AUTO-CONVERT + AUTO EXIT SCAN MODE
import { Search, Barcode, Loader2, X, Scale } from "lucide-react";

import React, { useCallback, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

import { useToast } from "@/components/ui/use-toast";
import ProductCard from "./ProductCard";
import { useDispatch, useSelector } from "react-redux";
import {
  getProductsByStore,
  searchProducts,
} from "../../../Redux Toolkit/features/product/productThunks";
import { getBranchById } from "../../../Redux Toolkit/features/branch/branchThunks";
import { clearSearchResults } from "@/Redux Toolkit/features/product/productSlice";
import { addToCart } from "../../../Redux Toolkit/features/cart/cartSlice";
import { getInventoryByBranch } from "../../../Redux Toolkit/features/inventory/inventoryThunks";

const ProductSection = ({ searchInputRef }) => {
  const dispatch = useDispatch();
  const { branch } = useSelector((state) => state.branch);
  const { userProfile } = useSelector((state) => state.user);
  const { inventories } = useSelector((state) => state.inventory);
  const { products, searchResults, loading, error: productsError } =
    useSelector((state) => state.product);
  const { paymentSuccess } = useSelector((state) => state.order || {});
  const { toast } = useToast();

  const [searchTerm, setSearchTerm] = useState("");
  const [isBarcodeMode, setIsBarcodeMode] = useState(false);
  const [isTenDigitMode, setIsTenDigitMode] = useState(false);

  const filterProductsByInventory = (productList) => {
    if (!inventories || inventories.length === 0) return productList;
    const inventoryProductIds = inventories.map(
      (inv) => inv.product?.id || inv.productId
    );
    return productList.filter((p) => inventoryProductIds.includes(p.id));
  };

  // ✅ PREFIX SEARCH
  const getDisplayProducts = () => {
    let baseList =
      searchTerm.trim() && searchResults.length > 0
        ? searchResults
        : products || [];

    if (searchTerm.trim() && !isBarcodeMode && !isTenDigitMode) {
      baseList = baseList.filter((p) =>
        (p.name || "").toLowerCase().startsWith(searchTerm.toLowerCase())
      );
    }

    const filtered = filterProductsByInventory(baseList);

    return [...filtered].sort((a, b) =>
      (a.name || "").localeCompare(b.name || "")
    );
  };

  useEffect(() => {
    const fetchData = async () => {
      if (branch?.storeId && localStorage.getItem("jwt")) {
        try {
          await dispatch(getProductsByStore(branch.storeId)).unwrap();
          await dispatch(getInventoryByBranch(branch.id)).unwrap();
        } catch (error) {
          toast({
            title: "Error",
            description: error || "Failed to fetch data",
            variant: "destructive",
          });
        }
      } else if (
        userProfile?.branchId &&
        localStorage.getItem("jwt") &&
        !branch
      ) {
        try {
          await dispatch(
            getBranchById({
              id: userProfile.branchId,
              jwt: localStorage.getItem("jwt"),
            })
          ).unwrap();
        } catch (error) {
          toast({
            title: "Error",
            description: "Failed to load branch information",
            variant: "destructive",
          });
        }
      }
    };
    fetchData();
  }, [dispatch, branch, userProfile, toast]);

  useEffect(() => {
    if (paymentSuccess && branch?.id) {
      dispatch(getInventoryByBranch(branch.id))
        .unwrap()
        .then(() => {
          toast({
            title: "Inventory Updated",
            description: "Stock levels refreshed.",
          });
        })
        .catch((error) => console.error("Failed to refresh inventory:", error));
    }
  }, [paymentSuccess, branch, dispatch, toast]);

  // ✅ UPDATED SCALE PARSER (9-digit & 10-digit → last 5 digits = quantity / 1000)
  const parseScaleBarcode = (barcode) => {
    let clean = barcode.trim();

    // ✅ 10-digit → remove 1st digit → becomes 9-digit
    if (clean.length === 10 && /^\d+$/.test(clean)) {
      clean = clean.substring(1);
    }

    // ✅ EXPECT 9-digit
    if (clean.length === 9 && /^\d+$/.test(clean)) {
      const productCode = clean.substring(0, 4);
      const qtyDigits = clean.substring(4);

      const quantity = parseInt(qtyDigits) / 1000; // ✅ 12345 → 12.345

      if (quantity > 0) {
        return { canParseAsScale: true, productCode, quantity };
      }
    }

    return { canParseAsScale: false, productCode: null, quantity: null };
  };

  // ✅ BARCODE SCANNING
  const handleBarcodeSearch = useCallback(
    async (barcode) => {
      if (!barcode.trim() || !branch?.storeId || !localStorage.getItem("jwt"))
        return;

      try {
        const results = await dispatch(
          searchProducts({ query: barcode.trim(), storeId: branch.storeId })
        ).unwrap();

        const exactMatch = results.find(
          (p) => p.sku === barcode.trim() || p.barcode === barcode.trim()
        );

        // ✅ EXACT NORMAL BARCODE MATCH
        if (exactMatch) {
          dispatch(addToCart(exactMatch));
          toast({
            title: "Added to cart",
            description: `${exactMatch.name} added`,
          });
          setSearchTerm("");
          dispatch(clearSearchResults());
          searchInputRef?.current?.focus();
          return;
        }

        // ✅ SCALE PARSER (9/10-digit)
        const parsed = parseScaleBarcode(barcode);

        if (parsed.canParseAsScale) {
          const scaleResults = await dispatch(
            searchProducts({
              query: parsed.productCode,
              storeId: branch.storeId,
            })
          ).unwrap();

          const exactScaleMatch = scaleResults.find(
            (p) =>
              p.sku === parsed.productCode || p.barcode === parsed.productCode
          );

          if (exactScaleMatch) {
            const productWithQty = {
              ...exactScaleMatch,
              quantity: parsed.quantity,
              isWeightedItem: true,
            };

            dispatch(addToCart(productWithQty));

            toast({
              title: "Added to cart",
              description: `${exactScaleMatch.name} (${parsed.quantity.toFixed(
                3
              )}) added`,
            });
          } else {
            toast({
              title: "Product Not Found",
              description: `No product with code: ${parsed.productCode}`,
              variant: "destructive",
            });
          }
        } else {
          toast({
            title: "Not Found",
            description: "Invalid scale barcode",
            variant: "destructive",
          });
        }

        setSearchTerm("");
        dispatch(clearSearchResults());
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to search product",
          variant: "destructive",
        });
      }
    },
    [dispatch, branch, toast, searchInputRef]
  );

  // ✅ SCALE MODE HANDLER
  const handleTenDigitBarcode = useCallback(
    async (barcode) => {
      let clean = barcode.trim();

      // ✅ Allow 10-digit → convert to 9-digit
      if (clean.length === 10 && /^\d+$/.test(clean)) {
        clean = clean.substring(1);
      }

      if (clean.length !== 9 || !/^\d+$/.test(clean)) {
        toast({
          title: "Invalid Scale Barcode",
          description: "9-digit or 10-digit required",
          variant: "destructive",
        });
        return;
      }

      const productCode = clean.substring(0, 4);
      const qtyDigits = clean.substring(4);
      const quantity = parseInt(qtyDigits) / 1000;

      try {
        const results = await dispatch(
          searchProducts({
            query: productCode,
            storeId: branch.storeId,
          })
        ).unwrap();

        const exact = results.find(
          (p) => p.sku === productCode || p.barcode === productCode
        );

        if (exact) {
          dispatch(
            addToCart({
              ...exact,
              quantity,
              isWeightedItem: true,
            })
          );

          toast({
            title: "Added",
            description: `${exact.name} (${quantity}) added`,
          });
        } else {
          toast({
            title: "Not Found",
            description: `No product for SKU ${productCode}`,
            variant: "destructive",
          });
        }

        setSearchTerm("");
        dispatch(clearSearchResults());
        searchInputRef?.current?.focus();
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to search product",
          variant: "destructive",
        });
      }
    },
    [dispatch, branch, toast, searchInputRef]
  );

  // ✅ DEBOUNCED SEARCH
  const debouncedSearch = useCallback(
    (() => {
      let timeoutId;
      return (query) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          if (query.trim() && branch?.storeId && localStorage.getItem("jwt")) {
            dispatch(
              searchProducts({ query: query.trim(), storeId: branch.storeId })
            ).catch((error) => {
              toast({
                title: "Search Error",
                description: error || "Failed",
                variant: "destructive",
              });
            });
          }
        }, 500);
      };
    })(),
    [dispatch, branch, toast]
  );

  // ✅ AUTO EXIT SCAN MODE WHEN TYPING LETTERS
  const handleSearchChange = (e) => {
    const value = e.target.value;

    if (/^[A-Za-z]/.test(value)) {
      if (isBarcodeMode || isTenDigitMode) {
        setIsBarcodeMode(false);
        setIsTenDigitMode(false);
        toast({
          title: "Scan Disabled",
          description: "Typing detected.",
        });
      }
    }

    setSearchTerm(value);

    if (!isBarcodeMode && !isTenDigitMode) {
      if (value.trim()) debouncedSearch(value);
      else dispatch(clearSearchResults());
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && searchTerm.trim()) {
      if (isBarcodeMode) handleBarcodeSearch(searchTerm);
      else if (isTenDigitMode) handleTenDigitBarcode(searchTerm);
    }
  };

  useEffect(() => {
    if (productsError) {
      toast({
        title: "Error",
        description: productsError,
        variant: "destructive",
      });
    }
  }, [productsError, toast]);

  return (
    <div className="w-2/5 flex flex-col bg-card border-r">
      <div className="p-4 border-b bg-muted">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            type="text"
            placeholder={
              isBarcodeMode
                ? "Scan barcode and press Enter..."
                : isTenDigitMode
                ? "Scan 9/10-digit scale barcode..."
                : "Search products or scan barcode (F1)"
            }
            className={`pl-10 pr-4 py-3 text-lg ${
              isBarcodeMode || isTenDigitMode
                ? "border-green-500 focus:border-green-600"
                : ""
            }`}
            value={searchTerm}
            onChange={handleSearchChange}
            onKeyPress={handleKeyPress}
            disabled={loading}
          />
        </div>

        <div className="flex items-center justify-between mt-2">
          <span className="text-sm text-muted-foreground">
            {loading
              ? "Loading products..."
              : `${getDisplayProducts().length} items`}
          </span>
          <div className="flex gap-2">
            {searchTerm.trim() && !isBarcodeMode && !isTenDigitMode && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={() => {
                  setSearchTerm("");
                  dispatch(clearSearchResults());
                }}
                disabled={loading}
              >
                <X className="w-4 h-4 mr-1" /> Clear
              </Button>
            )}

            <Button
              variant={isBarcodeMode ? "default" : "outline"}
              size="sm"
              className="text-xs"
              onClick={() => {
                setIsBarcodeMode(!isBarcodeMode);
                setIsTenDigitMode(false);
                setSearchTerm("");
                dispatch(clearSearchResults());
                toast({
                  title: isBarcodeMode
                    ? "Barcode Mode Off"
                    : "Barcode Mode On",
                });
                searchInputRef?.current?.focus();
              }}
            >
              <Barcode className="w-4 h-4 mr-1" />
              {isBarcodeMode ? "Scanning..." : "Scan Mode"}
            </Button>

            <Button
              variant={isTenDigitMode ? "default" : "outline"}
              size="sm"
              className="text-xs"
              onClick={() => {
                setIsTenDigitMode(!isTenDigitMode);
                setIsBarcodeMode(false);
                setSearchTerm("");
                dispatch(clearSearchResults());
                toast({
                  title: isTenDigitMode
                    ? "Scale Mode Off"
                    : "Scale Mode On",
                  description: "Scan 9/10-digit barcode",
                });
                searchInputRef?.current?.focus();
              }}
            >
              <Scale className="w-4 h-4 mr-1" />
              {isTenDigitMode ? "Scanning..." : "Scale barcode"}
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="flex flex-col items-center space-y-4">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              <p className="text-muted-foreground">Loading...</p>
            </div>
          </div>
        ) : getDisplayProducts().length === 0 ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <Search className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">
                {searchTerm
                  ? "No products found"
                  : "No products in inventory"}
              </p>
            </div>
          </div>
        ) : (
          <div className="grid lg:grid-cols-3 md:grid-cols-2 grid-cols-1 gap-3">
            {getDisplayProducts().map((product) => {
              const inv = inventories.find(
                (i) =>
                  i.product?.id === product.id || i.productId === product.id
              );
              const quantity = inv ? inv.quantity : 0;

              return (
                <ProductCard
                  key={product.id}
                  product={product}
                  quantity={quantity}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default ProductSection;
