// FULL UPDATED ProductSection WITH PREFIX NAME FILTER + 10-DIGIT SCAN MODE + AUTO EXIT SCAN MODE
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

  // ✅ UPDATED with prefix filtering
  const getDisplayProducts = () => {
    let baseList =
      searchTerm.trim() && searchResults.length > 0
        ? searchResults
        : products || [];

    // ✅ PREFIX SEARCH APPLIED ONLY IN NORMAL SEARCH MODE
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
          console.error("Fetch failed:", error);
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
          console.error("Failed to fetch branch:", error);
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
            description: "Stock levels refreshed after payment.",
          });
        })
        .catch((error) => console.error("Failed to refresh inventory:", error));
    }
  }, [paymentSuccess, branch, dispatch, toast]);

  const parseScaleBarcode = (barcode) => {
    const cleanBarcode = barcode.trim();
    if (cleanBarcode.length === 10 && /^\d+$/.test(cleanBarcode)) {
      const productCode = cleanBarcode.substring(0, 5);
      const weightValue = cleanBarcode.substring(5);
      const weight = parseInt(weightValue) / 1000;
      if (weight > 0 && weight < 100) {
        return { canParseAsScale: true, productCode, weight };
      }
    }
    if (cleanBarcode.length === 13 && cleanBarcode.startsWith("2")) {
      const productCode = cleanBarcode.substring(2, 7);
      const weightValue = cleanBarcode.substring(7, 12);
      const weight = parseInt(weightValue) / 1000;
      if (weight > 0 && weight < 100) {
        return { canParseAsScale: true, productCode, weight };
      }
    }
    return { canParseAsScale: false, productCode: cleanBarcode, weight: null };
  };

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

        if (exactMatch) {
          dispatch(addToCart(exactMatch));
          toast({
            title: "Added to cart",
            description: `${exactMatch.name} (1 unit) added to cart`,
          });
          setSearchTerm("");
          dispatch(clearSearchResults());
          searchInputRef?.current?.focus();
          return;
        }

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
              p.sku === parsed.productCode ||
              p.barcode === parsed.productCode
          );

          if (exactScaleMatch) {
            const productWithWeight = {
              ...exactScaleMatch,
              scannedWeight: parsed.weight,
              quantity: parsed.weight,
              isWeightedItem: true,
            };
            dispatch(addToCart(productWithWeight));
            toast({
              title: "Added to cart",
              description: `${exactScaleMatch.name} (${parsed.weight.toFixed(
                3
              )} kg) added to cart`,
            });
          } else {
            toast({
              title: "Product Not Found",
              description: `No product found with code: ${parsed.productCode}`,
              variant: "destructive",
            });
          }
        } else {
          toast({
            title: "Product Not Found",
            description: "No product found with this barcode",
            variant: "destructive",
          });
        }

        setSearchTerm("");
        dispatch(clearSearchResults());
      } catch (error) {
        console.error("Barcode search failed:", error);
        toast({
          title: "Search Error",
          description: error || "Failed to search product",
          variant: "destructive",
        });
        setSearchTerm("");
        dispatch(clearSearchResults());
      }
    },
    [dispatch, branch, toast, searchInputRef]
  );

  const handleTenDigitBarcode = useCallback(
    async (barcode) => {
      const clean = barcode.trim();
      if (clean.length !== 10 || !/^\d+$/.test(clean)) {
        toast({
          title: "Invalid Barcode",
          description: "Scale barcode required",
          variant: "destructive",
        });
        return;
      }

      const sku = clean.substring(0, 4);

      try {
        const results = await dispatch(
          searchProducts({ query: sku, storeId: branch.storeId })
        ).unwrap();

        const exact = results.find((p) => p.sku === sku || p.barcode === sku);

        if (exact) {
          dispatch(addToCart(exact));
          toast({
            title: "Added to cart",
            description: `${exact.name} added to cart`,
          });
        } else {
          toast({
            title: "Not Found",
            description: `No product found for SKU ${sku}`,
            variant: "destructive",
          });
        }

        setSearchTerm("");
        dispatch(clearSearchResults());
        searchInputRef?.current?.focus();
      } catch (error) {
        console.error("Scale barcode search failed:", error);
        toast({
          title: "Error",
          description: "Failed to search product",
          variant: "destructive",
        });
      }
    },
    [dispatch, branch, toast, searchInputRef]
  );

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
              console.error("Search failed:", error);
              toast({
                title: "Search Error",
                description: error || "Failed to search products",
                variant: "destructive",
              });
            });
          }
        }, 500);
      };
    })(),
    [dispatch, branch, toast]
  );

  // ✅ AUTO EXIT SCAN MODE WHEN NORMAL TYPING
  const handleSearchChange = (e) => {
    const value = e.target.value;

    if (/^[A-Za-z]/.test(value)) {
      if (isBarcodeMode || isTenDigitMode) {
        setIsBarcodeMode(false);
        setIsTenDigitMode(false);
        toast({
          title: "Scanner Mode Disabled",
          description: "Typing detected. Switched to normal search.",
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
                ? "Scan Scale barcode and press Enter..."
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
              : `${getDisplayProducts().length} products available in inventory`}
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
                    ? "Barcode Mode Disabled"
                    : "Barcode Mode Enabled",
                  description: "Scan product and press Enter",
                });
                searchInputRef?.current?.focus();
              }}
              disabled={loading}
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
                    ? "Scale barcode Scan Disabled"
                    : "Scale barcode Scan Enabled",
                  description: "Scan Scale barcode and press Enter",
                });
                searchInputRef?.current?.focus();
              }}
              disabled={loading}
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
              <p className="text-muted-foreground">Loading products...</p>
            </div>
          </div>
        ) : getDisplayProducts().length === 0 ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <Search className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">
                {searchTerm
                  ? "No products found matching your search"
                  : "No products found in inventory"}
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
