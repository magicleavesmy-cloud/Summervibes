import { useEffect, useMemo, useState } from "react";
import "./App.css";
import { products } from "./products";

const whatsappNumber = "601165302622";
const adminPasscode = "2622";
const adminSessionKey = "summer-vibes-admin";
const themeStorageKey = "summer-vibes-theme";
const discountThreshold = 300;
const discountRate = 0.1;
const defaultProductImage =
  "https://images.unsplash.com/photo-1523293182086-7651a899d37f?auto=format&fit=crop&w=900&q=80";
const productsApiPath = "/api/products";

function normalizeFlavours(flavours, defaultStock = 0) {
  if (!Array.isArray(flavours)) {
    return [];
  }

  return flavours
    .map((flavour) => {
      if (typeof flavour === "string") {
        return {
          name: flavour,
          price: "",
          stock: Math.max(0, Math.floor(Number(defaultStock) || 0)),
        };
      }

      return {
        name: flavour.name || "",
        price: flavour.price || "",
        stock: Math.max(0, Math.floor(Number(flavour.stock) || 0)),
      };
    })
    .filter((flavour) => flavour.name.trim());
}

function getTotalStock(product) {
  return product.flavours.reduce((total, flavour) => total + flavour.stock, 0);
}

function getFlavourStock(product, flavourName) {
  return (
    product.flavours.find((flavour) => flavour.name === flavourName)?.stock || 0
  );
}

function getFlavourPrice(product, flavourName) {
  const flavourPrice = product.flavours
    .find((flavour) => flavour.name === flavourName)
    ?.price?.trim();

  return flavourPrice || product.price;
}

function getFlavourNames(product) {
  return product.flavours.length > 0
    ? product.flavours.map((flavour) => flavour.name)
    : ["No flavour"];
}

function getFirstInStockFlavour(product, fallbackFlavour) {
  return (
    product.flavours.find((flavour) => flavour.stock > 0)?.name ||
    fallbackFlavour
  );
}

function getFallbackProducts() {
  return products.map((product) => ({
    ...product,
    flavours: normalizeFlavours(product.flavours, product.stock),
  }));
}

function serializeProducts(productList) {
  return productList.map(({
    id,
    name,
    category,
    price,
    rating,
    tag,
    description,
    image,
    flavours,
  }) => ({
    id,
    name,
    category,
    price,
    rating,
    tag,
    description,
    image,
    flavours,
  }));
}

function mergeSavedProducts(savedProducts, fallbackProducts) {
  if (!Array.isArray(savedProducts)) {
    return fallbackProducts;
  }

  const fallbackProductById = new Map(
    fallbackProducts.map((product) => [product.id, product]),
  );
  const savedProductIds = new Set(savedProducts.map((product) => product.id));

  const mergedProducts = savedProducts.map((savedProduct) => {
    const product = fallbackProductById.get(savedProduct.id);

    return product
      ? {
          ...product,
          name: savedProduct.name ?? product.name,
          category: savedProduct.category ?? product.category,
          price: savedProduct.price ?? product.price,
          rating: savedProduct.rating ?? product.rating,
          tag: savedProduct.tag ?? product.tag,
          description: savedProduct.description ?? product.description,
          image: savedProduct.image ?? product.image,
          flavours: normalizeFlavours(
            savedProduct.flavours,
            savedProduct.stock ?? product.stock,
          ),
        }
      : {
          id: savedProduct.id,
          name: savedProduct.name ?? "New product",
          category: savedProduct.category ?? "Disposable Vape",
          price: savedProduct.price ?? "RM0",
          rating: savedProduct.rating ?? "4.5",
          tag: savedProduct.tag ?? "New",
          description:
            savedProduct.description ??
            "Choose a flavour and add this product to your cart.",
          image: savedProduct.image ?? defaultProductImage,
          flavours: normalizeFlavours(savedProduct.flavours),
        };
  });

  const newFallbackProducts = fallbackProducts.filter(
    (product) => !savedProductIds.has(product.id),
  );

  return [...mergedProducts, ...newFallbackProducts];
}

async function getApiErrorMessage(response) {
  try {
    const data = await response.json();

    if (data?.error) {
      return data.error;
    }
  } catch {
    // Fall through to the generic status message below.
  }

  return `Request failed with ${response.status}`;
}

function CartItem({ addToCart, item, product, removeFromCart }) {
  const currentProduct = product || item;
  const itemPrice = product
    ? getFlavourPrice(product, item.selectedFlavour)
    : item.price;
  const flavourStock = product
    ? getFlavourStock(product, item.selectedFlavour)
    : item.stock;
  const canAddMore = item.quantity < flavourStock;

  return (
    <div className="cart-item">
      <div>
        <strong>{currentProduct.name}</strong>
        <span>
          {item.selectedFlavour} {" - "}
          {itemPrice} {" - "} Qty {item.quantity}
        </span>
      </div>
      <div className="quantity-controls">
        <button onClick={() => removeFromCart(item.cartId)} type="button">
          -
        </button>
        <span>{item.quantity}</span>
        <button
          disabled={!canAddMore}
          onClick={() => addToCart(currentProduct, item.selectedFlavour)}
          type="button"
        >
          +
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const isAdminRoute = window.location.pathname === "/admin";
  const [adminCode, setAdminCode] = useState("");
  const [isAdminUnlocked, setIsAdminUnlocked] = useState(
    () => window.sessionStorage.getItem(adminSessionKey) === "true",
  );
  const [expandedProductId, setExpandedProductId] = useState(null);
  const [storeProducts, setStoreProducts] = useState(getFallbackProducts);
  const [remoteSyncStatus, setRemoteSyncStatus] = useState("checking");
  const [cart, setCart] = useState([]);
  const [selectedProductId, setSelectedProductId] = useState(null);
  const [adminSearch, setAdminSearch] = useState("");
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [draggedProductId, setDraggedProductId] = useState(null);
  const [savingProductId, setSavingProductId] = useState(null);
  const [productUpdateStatus, setProductUpdateStatus] = useState({});
  const [sharedUpdateStatus, setSharedUpdateStatus] = useState("");
  const [theme, setTheme] = useState(
    () => window.localStorage.getItem(themeStorageKey) || "light",
  );
  const [selectedFlavours, setSelectedFlavours] = useState(() =>
    Object.fromEntries(
      products.map((product) => [product.id, product.flavours[0]]),
    ),
  );

  useEffect(() => {
    let isMounted = true;

    async function loadRemoteProducts() {
      try {
        const response = await fetch(`${productsApiPath}?v=${Date.now()}`, {
          cache: "no-store",
        });

        if (response.status === 501) {
          if (isMounted) {
            setRemoteSyncStatus("unconfigured");
          }
          return;
        }

        if (!response.ok) {
          throw new Error(await getApiErrorMessage(response));
        }

        const data = await response.json();

        if (Array.isArray(data.products) && isMounted) {
          setStoreProducts(
            mergeSavedProducts(data.products, getFallbackProducts()),
          );
        }

        if (isMounted) {
          setRemoteSyncStatus("ready");
        }
      } catch {
        if (isMounted) {
          setRemoteSyncStatus("error");
        }
      }
    }

    loadRemoteProducts();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(themeStorageKey, theme);
  }, [theme]);

  useEffect(() => {
    function closeDetailWithEscape(event) {
      if (event.key === "Escape") {
        closeProductDetail();
        closeCart();
      }
    }

    if (!selectedProductId && !isCartOpen) {
      return;
    }

    window.addEventListener("keydown", closeDetailWithEscape);

    return () => {
      window.removeEventListener("keydown", closeDetailWithEscape);
    };
  }, [isCartOpen, selectedProductId]);

  const productById = useMemo(
    () => new Map(storeProducts.map((product) => [product.id, product])),
    [storeProducts],
  );

  const selectedProduct = selectedProductId
    ? productById.get(selectedProductId)
    : null;

  const cartTotal = useMemo(
    () =>
      cart.reduce((total, item) => {
        const product = productById.get(item.id);
        const itemPrice = product
          ? getFlavourPrice(product, item.selectedFlavour)
          : item.price;
        const price = Number(itemPrice.replace(/[^0-9.]/g, ""));
        return total + price * item.quantity;
      }, 0),
    [cart, productById],
  );
  const cartDiscount =
    cartTotal > discountThreshold ? cartTotal * discountRate : 0;
  const cartFinalTotal = Math.max(cartTotal - cartDiscount, 0);

  const cartCount = cart.reduce((total, item) => total + item.quantity, 0);
  const adminSearchTerm = adminSearch.trim().toLowerCase();
  const adminStats = useMemo(() => {
    const totalStock = storeProducts.reduce(
      (total, product) => total + getTotalStock(product),
      0,
    );
    const totalFlavours = storeProducts.reduce(
      (total, product) => total + product.flavours.length,
      0,
    );
    const lowStockProducts = storeProducts.filter((product) => {
      const totalStockForProduct = getTotalStock(product);
      return totalStockForProduct > 0 && totalStockForProduct <= 3;
    }).length;
    const outOfStockProducts = storeProducts.filter(
      (product) => getTotalStock(product) === 0,
    ).length;

    return {
      lowStockProducts,
      outOfStockProducts,
      totalFlavours,
      totalStock,
    };
  }, [storeProducts]);
  const filteredAdminProducts = useMemo(() => {
    if (!adminSearchTerm) {
      return storeProducts;
    }

    return storeProducts.filter((product) => {
      const searchableProduct = [
        product.name,
        product.category,
        product.price,
        product.tag,
        ...product.flavours.map((flavour) => flavour.name),
      ]
        .join(" ")
        .toLowerCase();

      return searchableProduct.includes(adminSearchTerm);
    });
  }, [adminSearchTerm, storeProducts]);

  function addToCart(product, flavour) {
    const availableFlavours = getFlavourNames(product);
    const preferredFlavour = availableFlavours.includes(flavour)
      ? flavour
      : availableFlavours.includes(selectedFlavours[product.id])
        ? selectedFlavours[product.id]
        : availableFlavours[0];
    const selectedFlavour =
      getFlavourStock(product, preferredFlavour) > 0
        ? preferredFlavour
        : getFirstInStockFlavour(product, preferredFlavour);
    const selectedPrice = getFlavourPrice(product, selectedFlavour);
    const flavourStock = getFlavourStock(product, selectedFlavour);
    const currentQuantity = cart
      .filter(
        (item) =>
          item.id === product.id && item.selectedFlavour === selectedFlavour,
      )
      .reduce((total, item) => total + item.quantity, 0);

    if (currentQuantity >= flavourStock) {
      return;
    }

    const cartId = `${product.id}-${selectedFlavour}`;

    setCart((currentCart) => {
      const existingItem = currentCart.find((item) => item.cartId === cartId);

      if (existingItem) {
        return currentCart.map((item) =>
          item.cartId === cartId
            ? {
                ...item,
                name: product.name,
                price: selectedPrice,
                quantity: item.quantity + 1,
              }
            : item,
        );
      }

      return [
        ...currentCart,
        { ...product, cartId, price: selectedPrice, selectedFlavour, quantity: 1 },
      ];
    });
  }

  function removeFromCart(cartId) {
    setCart((currentCart) =>
      currentCart
        .map((item) =>
          item.cartId === cartId ? { ...item, quantity: item.quantity - 1 } : item,
        )
        .filter((item) => item.quantity > 0),
    );
  }

  function clearCart() {
    setCart([]);
  }

  function openProductDetail(productId) {
    setSelectedProductId(productId);
  }

  function closeProductDetail() {
    setSelectedProductId(null);
  }

  function openCart() {
    setIsCartOpen(true);
  }

  function closeCart() {
    setIsCartOpen(false);
  }

  function handleProductCardKeyDown(event, productId) {
    if (event.target !== event.currentTarget) {
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openProductDetail(productId);
    }
  }

  function handleProductDragStart(event, productId) {
    if (adminSearchTerm) {
      event.preventDefault();
      return;
    }

    setDraggedProductId(productId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(productId));
  }

  function handleProductDragOver(event) {
    if (!adminSearchTerm && draggedProductId) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    }
  }

  function handleProductDrop(event, targetProductId) {
    event.preventDefault();

    if (adminSearchTerm) {
      return;
    }

    const sourceProductId =
      draggedProductId || Number(event.dataTransfer.getData("text/plain"));

    if (!sourceProductId || sourceProductId === targetProductId) {
      setDraggedProductId(null);
      return;
    }

    setStoreProducts((currentProducts) => {
      const sourceIndex = currentProducts.findIndex(
        (product) => product.id === sourceProductId,
      );
      const targetIndex = currentProducts.findIndex(
        (product) => product.id === targetProductId,
      );

      if (sourceIndex < 0 || targetIndex < 0) {
        return currentProducts;
      }

      const nextProducts = [...currentProducts];
      const [movedProduct] = nextProducts.splice(sourceIndex, 1);
      nextProducts.splice(targetIndex, 0, movedProduct);
      return nextProducts;
    });

    setDraggedProductId(null);
  }

  function handleProductDragEnd() {
    setDraggedProductId(null);
  }

  function updateProduct(productId, field, value) {
    setStoreProducts((currentProducts) =>
      currentProducts.map((product) =>
        product.id === productId ? { ...product, [field]: value } : product,
      ),
    );
    setProductUpdateStatus((currentStatus) => ({
      ...currentStatus,
      [productId]: "",
    }));
    setSharedUpdateStatus("");
  }

  function clearProductUpdateStatus(productId) {
    setProductUpdateStatus((currentStatus) => ({
      ...currentStatus,
      [productId]: "",
    }));
    setSharedUpdateStatus("");
  }

  async function updateSharedProducts(productId = null) {
    const isProductSave = productId !== null;

    setSavingProductId(isProductSave ? productId : "all");
    setRemoteSyncStatus("saving");

    if (isProductSave) {
      setProductUpdateStatus((currentStatus) => ({
        ...currentStatus,
        [productId]: "Updating...",
      }));
    } else {
      setSharedUpdateStatus("Updating...");
    }

    try {
      const response = await fetch(productsApiPath, {
        body: JSON.stringify({ products: serializeProducts(storeProducts) }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      if (!response.ok) {
        throw new Error(await getApiErrorMessage(response));
      }

      setRemoteSyncStatus("ready");

      if (isProductSave) {
        setProductUpdateStatus((currentStatus) => ({
          ...currentStatus,
          [productId]: "Updated",
        }));
      } else {
        setSharedUpdateStatus("Updated");
      }
    } catch (error) {
      const errorMessage =
        error.message ||
        "Update failed. Check the Vercel shared inventory settings.";

      setRemoteSyncStatus(
        errorMessage.includes("not configured") ? "unconfigured" : "error",
      );

      if (isProductSave) {
        setProductUpdateStatus((currentStatus) => ({
          ...currentStatus,
          [productId]: errorMessage,
        }));
      } else {
        setSharedUpdateStatus(errorMessage);
      }
    } finally {
      setSavingProductId(null);
    }
  }

  function addProduct() {
    const nextProduct = {
      id: Date.now(),
      name: "New product",
      category: "Disposable Vape",
      price: "RM0",
      rating: "4.5",
      tag: "New",
      description: "Choose a flavour and add this product to your cart.",
      image: defaultProductImage,
      flavours: [{ name: "New flavour", price: "", stock: 0 }],
    };

    setStoreProducts((currentProducts) => [...currentProducts, nextProduct]);
    setExpandedProductId(nextProduct.id);
  }

  function deleteProduct(productId) {
    const product = storeProducts.find((item) => item.id === productId);
    const shouldDelete = window.confirm(
      `Delete ${product?.name || "this product"}?`,
    );

    if (!shouldDelete) {
      return;
    }

    setStoreProducts((currentProducts) =>
      currentProducts.filter((item) => item.id !== productId),
    );
    setCart((currentCart) => currentCart.filter((item) => item.id !== productId));
    setExpandedProductId(null);
  }

  function updateFlavour(productId, flavourIndex, field, value) {
    clearProductUpdateStatus(productId);
    setStoreProducts((currentProducts) =>
      currentProducts.map((product) => {
        if (product.id !== productId) {
          return product;
        }

        return {
          ...product,
          flavours: product.flavours
            .map((flavour, index) => {
              if (index !== flavourIndex) {
                return flavour;
              }

              return {
                ...flavour,
                [field]:
                  field === "stock"
                    ? Math.max(0, Math.floor(Number(value) || 0))
                    : value,
              };
            })
            .filter((flavour) => flavour.name.trim()),
        };
      }),
    );
  }

  function addFlavour(productId) {
    clearProductUpdateStatus(productId);
    setStoreProducts((currentProducts) =>
      currentProducts.map((product) =>
        product.id === productId
          ? {
              ...product,
              flavours: [
                ...product.flavours,
                { name: "New flavour", price: "", stock: 0 },
              ],
            }
          : product,
      ),
    );
  }

  function removeFlavour(productId, flavourIndex) {
    clearProductUpdateStatus(productId);
    setStoreProducts((currentProducts) =>
      currentProducts.map((product) =>
        product.id === productId
          ? {
              ...product,
              flavours: product.flavours.filter(
                (_, index) => index !== flavourIndex,
              ),
            }
          : product,
      ),
    );
  }

  function checkoutWithWhatsApp() {
    const orderLines = cart.map((item) => {
      const product = productById.get(item.id);
      const productName = product?.name || item.name;
      const productPrice = product
        ? getFlavourPrice(product, item.selectedFlavour)
        : item.price;

      return `- ${productName} x${item.quantity} (${productPrice}) | Flavour: ${item.selectedFlavour}`;
    });

    const message = [
      "Hi Summer Vibes Vape, I want to order:",
      "",
      ...orderLines,
      "",
      `Subtotal: RM${cartTotal.toFixed(2)}`,
      cartDiscount > 0
        ? `Discount above RM${discountThreshold}: -RM${cartDiscount.toFixed(2)}`
        : null,
      `Total: RM${cartFinalTotal.toFixed(2)}`,
      "",
      "Name:",
      "Delivery / pickup:",
    ]
      .filter(Boolean)
      .join("\n");

    window.open(
      `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`,
      "_blank",
    );
  }

  function unlockAdmin(event) {
    event.preventDefault();

    if (adminCode === adminPasscode) {
      window.sessionStorage.setItem(adminSessionKey, "true");
      setIsAdminUnlocked(true);
      setAdminCode("");
    }
  }

  function logoutAdmin() {
    window.sessionStorage.removeItem(adminSessionKey);
    setIsAdminUnlocked(false);
  }

  function toggleTheme() {
    setTheme((currentTheme) => (currentTheme === "dark" ? "light" : "dark"));
  }

  return (
    <main className={`store ${isAdminRoute ? "admin-store" : ""}`}>
      <nav className="store-nav" aria-label="Store sections">
        <img
          className="brand-logo"
          src="/summer-vibes-logo.png"
          alt="Summer Vibes"
        />
        <div className="store-nav-actions">
          <button
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
            className="theme-toggle"
            onClick={toggleTheme}
            type="button"
          >
            {theme === "dark" ? (
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <circle cx="12" cy="12" fill="currentColor" r="4" />
                <path
                  d="M12 2v3m0 14v3M4.9 4.9 7 7m10 10 2.1 2.1M2 12h3m14 0h3M4.9 19.1 7 17m10-10 2.1-2.1"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeWidth="1.8"
                />
              </svg>
            ) : (
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path
                  d="M20 15.5A8.2 8.2 0 0 1 8.5 4 8.2 8.2 0 1 0 20 15.5Z"
                  fill="currentColor"
                />
              </svg>
            )}
          </button>
          <a
            aria-label="Chat with Summer Vibes on WhatsApp"
            className="whatsapp-link"
            href={`https://wa.me/${whatsappNumber}`}
            rel="noreferrer"
            target="_blank"
          >
            <svg
              aria-hidden="true"
              fill="none"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M7.2 19.4 4 20.2l.9-3.1a8 8 0 1 1 2.3 2.3Z"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.8"
              />
              <path
                d="M8.9 8.7c.2-.5.4-.5.8-.5h.5c.2 0 .4.1.5.4l.7 1.5c.1.3.1.5-.1.7l-.4.5c-.2.2-.2.4 0 .6.5.9 1.3 1.7 2.2 2.1.2.1.4.1.6-.1l.6-.6c.2-.2.4-.2.7-.1l1.4.7c.3.2.4.4.4.7 0 .5-.1.9-.5 1.2-.4.4-1 .5-1.6.4-3.5-.8-6.2-3.4-7-6.9-.1-.6.1-1.1.5-1.6Z"
                fill="currentColor"
              />
            </svg>
            <span>Whatsapp</span>
          </a>
        </div>
      </nav>

      {isAdminRoute ? (
        !isAdminUnlocked ? (
          <section className="admin-login" aria-label="Admin login">
            <form onSubmit={unlockAdmin}>
              <p className="eyebrow">Admin page</p>
              <h1>Inventory control</h1>
              <label>
                <span>Passcode</span>
                <input
                  onChange={(event) => setAdminCode(event.target.value)}
                  type="password"
                  value={adminCode}
                />
              </label>
              <button type="submit">Unlock</button>
            </form>
          </section>
        ) : (
        <section className="control-page" aria-label="Product controls">
          <div className="control-header">
            <div>
              <p className="eyebrow">Inventory workspace</p>
              <h1>Product control</h1>
            </div>
            <div className="control-header-actions">
              <p className={`sync-status ${remoteSyncStatus}`}>
                {remoteSyncStatus === "ready"
                  ? "Shared inventory connected"
                  : remoteSyncStatus === "saving"
                    ? "Saving shared inventory..."
                    : remoteSyncStatus === "unconfigured"
                      ? "Shared inventory is not configured"
                      : remoteSyncStatus === "error"
                        ? "Shared inventory is not saving"
                        : "Checking shared inventory..."}
              </p>
              <div>
                <button
                  disabled={savingProductId === "all"}
                  onClick={() => updateSharedProducts()}
                  type="button"
                >
                  {savingProductId === "all" ? "Saving..." : "Save all"}
                </button>
                <button onClick={addProduct} type="button">
                  Add product
                </button>
                <button onClick={logoutAdmin} type="button">
                  Logout
                </button>
              </div>
              {sharedUpdateStatus && <span>{sharedUpdateStatus}</span>}
            </div>
          </div>

          <section className="control-overview" aria-label="Inventory overview">
            <article>
              <span>Total stock</span>
              <strong>{adminStats.totalStock}</strong>
            </article>
            <article>
              <span>Products</span>
              <strong>{storeProducts.length}</strong>
            </article>
            <article>
              <span>Flavours</span>
              <strong>{adminStats.totalFlavours}</strong>
            </article>
            <article>
              <span>Low stock</span>
              <strong>{adminStats.lowStockProducts}</strong>
            </article>
            <article>
              <span>Out</span>
              <strong>{adminStats.outOfStockProducts}</strong>
            </article>
          </section>

          <section className="control-toolbar" aria-label="Product search">
            <label>
              <span>Search inventory</span>
              <input
                onChange={(event) => setAdminSearch(event.target.value)}
                placeholder="Search product, flavour, tag..."
                type="search"
                value={adminSearch}
              />
            </label>
            <p>
              {adminSearchTerm
                ? "Clear search to reorder"
                : "Drag rows to arrange"}{" "}
              {" - "} Showing {filteredAdminProducts.length} of{" "}
              {storeProducts.length}
            </p>
          </section>

          <div className="control-list">
            {filteredAdminProducts.map((product) => {
              const totalStock = getTotalStock(product);
              const isExpanded = expandedProductId === product.id;
              const stockStatus =
                totalStock === 0
                  ? "out-stock"
                  : totalStock <= 3
                    ? "low-stock"
                    : "in-stock";
              const stockLabel =
                totalStock === 0
                  ? "Out of stock"
                  : totalStock <= 3
                    ? `${totalStock} low`
                    : `${totalStock} total`;

              return (
                <article
                  className={`control-row ${isExpanded ? "expanded" : ""} ${
                    draggedProductId === product.id ? "dragging" : ""
                  }`}
                  draggable={!adminSearchTerm}
                  onDragEnd={handleProductDragEnd}
                  onDragOver={handleProductDragOver}
                  onDragStart={(event) =>
                    handleProductDragStart(event, product.id)
                  }
                  onDrop={(event) => handleProductDrop(event, product.id)}
                  key={product.id}
                >
                  <button
                    className="control-card-summary"
                    onClick={() =>
                      setExpandedProductId(isExpanded ? null : product.id)
                    }
                    type="button"
                  >
                    <span className="drag-handle" aria-hidden="true">
                      ::
                    </span>
                    <img src={product.image} alt="" />
                    <span>
                      <strong>{product.name}</strong>
                      <small>
                        {product.flavours.length} flavours {" - "} {product.price}
                      </small>
                    </span>
                    <strong className={stockStatus}>{stockLabel}</strong>
                    <em>{isExpanded ? "Close" : "Edit"}</em>
                  </button>

                  {isExpanded && (
                    <div className="control-card-editor">
                      <div className="product-edit-fields">
                        <label>
                          <span>Product name</span>
                          <input
                            onChange={(event) =>
                              updateProduct(
                                product.id,
                                "name",
                                event.target.value,
                              )
                            }
                            value={product.name}
                          />
                        </label>
                        <label>
                          <span>Price</span>
                          <input
                            onChange={(event) =>
                              updateProduct(
                                product.id,
                                "price",
                                event.target.value,
                              )
                            }
                            placeholder="RM42"
                            value={product.price}
                          />
                        </label>
                        <label>
                          <span>Product tagline</span>
                          <input
                            onChange={(event) =>
                              updateProduct(
                                product.id,
                                "tag",
                                event.target.value,
                              )
                            }
                            placeholder="Limited drop"
                            value={product.tag}
                          />
                        </label>
                        <label>
                          <span>Product subtitle</span>
                          <input
                            onChange={(event) =>
                              updateProduct(
                                product.id,
                                "description",
                                event.target.value,
                              )
                            }
                            placeholder="Short product detail text"
                            value={product.description || ""}
                          />
                        </label>
                        <label>
                          <span>Image URL</span>
                          <input
                            onChange={(event) =>
                              updateProduct(
                                product.id,
                                "image",
                                event.target.value,
                              )
                            }
                            value={product.image}
                          />
                        </label>
                        <div className="product-update-actions">
                          <button
                            className="update-product"
                            disabled={savingProductId === product.id}
                            onClick={() => updateSharedProducts(product.id)}
                            type="button"
                          >
                            {savingProductId === product.id
                              ? "Updating..."
                              : "Update"}
                          </button>
                          {productUpdateStatus[product.id] && (
                            <span>{productUpdateStatus[product.id]}</span>
                          )}
                        </div>
                        <button
                          className="delete-product"
                          onClick={() => deleteProduct(product.id)}
                          type="button"
                        >
                          Delete product
                        </button>
                      </div>
                      <div className="flavour-control">
                        <div className="flavour-control-header">
                          <span>Flavours</span>
                          <button
                            className="add-flavour"
                            onClick={() => addFlavour(product.id)}
                            type="button"
                          >
                            Add flavour
                          </button>
                        </div>
                        <div className="flavour-inventory">
                          {product.flavours.map((flavour, flavourIndex) => (
                            <div
                              className="flavour-line"
                              key={`${product.id}-${flavourIndex}`}
                            >
                              <input
                                aria-label="Flavour name"
                                onChange={(event) =>
                                  updateFlavour(
                                    product.id,
                                    flavourIndex,
                                    "name",
                                    event.target.value,
                                  )
                                }
                                value={flavour.name}
                              />
                              <input
                                aria-label={`${flavour.name} quantity`}
                                min="0"
                                onChange={(event) =>
                                  updateFlavour(
                                    product.id,
                                    flavourIndex,
                                    "stock",
                                    event.target.value,
                                  )
                                }
                                type="number"
                                value={flavour.stock}
                              />
                              <input
                                aria-label={`${flavour.name} price override`}
                                onChange={(event) =>
                                  updateFlavour(
                                    product.id,
                                    flavourIndex,
                                    "price",
                                    event.target.value,
                                  )
                                }
                                placeholder={product.price}
                                value={flavour.price || ""}
                              />
                              <button
                                className="remove-flavour"
                                onClick={() =>
                                  removeFlavour(product.id, flavourIndex)
                                }
                                type="button"
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
            {filteredAdminProducts.length === 0 && (
              <p className="control-empty">No products match this search.</p>
            )}
          </div>
        </section>
        )
      ) : (
        <>
          <section className="store-hero" aria-label="Featured promotion">
            <div className="hero-image-track" aria-hidden="true">
              <img
                src="https://vapehaus.com.my/cdn/shop/files/space_bar_poster_3.jpg?v=1778158986&width=1445"
                alt=""
              />
            </div>
            <div className="hero-banner-copy">
              <p className="eyebrow">Featured drop</p>
              <h1>
                SPACEBAR by <br />
                DOTMOD
              </h1>
              <p>Browse flavours and checkout through WhatsApp.</p>
            </div>
          </section>

          <section className="catalog-header">
            <div>
              <p className="eyebrow">Featured products</p>
              <h2>Popular right now</h2>
            </div>
            <p>
              {storeProducts.length} products available {" - "}
              {cartCount} in cart
            </p>
          </section>

          <section className="product-grid">
            {storeProducts.map((product) => {
              const availableFlavours = getFlavourNames(product);
              const preferredFlavour = availableFlavours.includes(
                selectedFlavours[product.id],
              )
                ? selectedFlavours[product.id]
                : availableFlavours[0];
              const selectedFlavour =
                getFlavourStock(product, preferredFlavour) > 0
                  ? preferredFlavour
                  : getFirstInStockFlavour(product, preferredFlavour);
              const cartQuantity = cart
                .filter(
                  (item) =>
                    item.id === product.id &&
                    item.selectedFlavour === selectedFlavour,
                )
                .reduce((total, item) => total + item.quantity, 0);
              const flavourStock = getFlavourStock(product, selectedFlavour);
              const selectedPrice = getFlavourPrice(product, selectedFlavour);
              const remainingStock = Math.max(flavourStock - cartQuantity, 0);
              const isSoldOut = remainingStock <= 0;

              return (
                <article
                  className="product-card"
                  key={product.id}
                  onClick={() => openProductDetail(product.id)}
                  onKeyDown={(event) =>
                    handleProductCardKeyDown(event, product.id)
                  }
                  role="button"
                  tabIndex="0"
                >
                  <div className="image-wrap">
                    <img src={product.image} alt={product.name} />
                    <span>{product.tag}</span>
                  </div>

                  <div className="product-info">
                    <p className="category">{product.category}</p>
                    <h3>{product.name}</h3>
                    <p className="product-subtitle">
                      {product.description ||
                        "Choose a flavour and add this product to your cart."}
                    </p>
                    <div
                      className="flavour-select"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <span>Choose flavour</span>
                      <label className="flavour-dropdown">
                        <span className="sr-only">
                          Choose flavour for {product.name}
                        </span>
                        <select
                          className="flavour-trigger"
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) =>
                            setSelectedFlavours((currentFlavours) => ({
                              ...currentFlavours,
                              [product.id]: event.target.value,
                            }))
                          }
                          value={selectedFlavour}
                        >
                          {availableFlavours.map((flavour) => {
                            const hasNoStock =
                              getFlavourStock(product, flavour) <= 0;

                            return (
                              <option
                                className={hasNoStock ? "no-stock-option" : ""}
                                disabled={hasNoStock}
                                key={flavour}
                                value={flavour}
                              >
                                {hasNoStock ? `${flavour} - No stock` : flavour}
                              </option>
                            );
                          })}
                        </select>
                      </label>
                      {flavourStock <= 0 && (
                        <em className="flavour-stock-note">No stock</em>
                      )}
                    </div>
                    <div className="product-meta">
                      <strong>{selectedPrice}</strong>
                      <span>{remainingStock} left</span>
                    </div>
                    <span className="detail-hint">View details</span>
                  </div>

                  <button
                    className="cart-button"
                    disabled={isSoldOut}
                    onClick={(event) => {
                      event.stopPropagation();
                      addToCart(product);
                    }}
                    type="button"
                  >
                    {isSoldOut ? "Sold Out" : "Add to Cart"}
                  </button>
                </article>
              );
            })}
          </section>

          <button
            aria-label={`Open cart with ${cartCount} items`}
            className={`floating-cart ${cartCount > 0 ? "has-items" : ""}`}
            onClick={openCart}
            type="button"
          >
            <span className="floating-cart-icon" aria-hidden="true">
              Cart
            </span>
            <span>
              <strong>{cartCount}</strong>
              <small>RM{cartFinalTotal.toFixed(2)}</small>
            </span>
          </button>

          {isCartOpen && (
            <section
              aria-label="Cart details"
              className="cart-popover-backdrop"
              onClick={closeCart}
            >
              <aside
                aria-modal="true"
                className="cart-popover"
                onClick={(event) => event.stopPropagation()}
                role="dialog"
              >
                <div className="cart-popover-header">
                  <div>
                    <p className="eyebrow">WhatsApp checkout</p>
                    <h2>Your cart</h2>
                  </div>
                  <button
                    aria-label="Close cart"
                    className="cart-popover-close"
                    onClick={closeCart}
                    type="button"
                  >
                    x
                  </button>
                </div>

                {cart.length === 0 ? (
                  <p className="empty-cart">Add products to start an order.</p>
                ) : (
                  <div className="cart-items">
                    {cart.map((item) => (
                      <CartItem
                        addToCart={addToCart}
                        item={item}
                        key={item.cartId}
                        product={productById.get(item.id)}
                        removeFromCart={removeFromCart}
                      />
                    ))}
                  </div>
                )}

                <div className="checkout-actions">
                  <div className="cart-totals">
                    <p>
                      <span>Subtotal</span>
                      <strong>RM{cartTotal.toFixed(2)}</strong>
                    </p>
                    <p>
                      <span>Discount above RM{discountThreshold}</span>
                      <strong>
                        {cartDiscount > 0
                          ? `-RM${cartDiscount.toFixed(2)}`
                          : "RM0.00"}
                      </strong>
                    </p>
                    <p className="cart-total-final">
                      <span>Total</span>
                      <strong>RM{cartFinalTotal.toFixed(2)}</strong>
                    </p>
                  </div>
                  <button
                    className="checkout-button"
                    disabled={cart.length === 0}
                    onClick={checkoutWithWhatsApp}
                    type="button"
                  >
                    Checkout with WhatsApp
                  </button>
                  {cart.length > 0 && (
                    <button
                      className="clear-button"
                      onClick={clearCart}
                      type="button"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </aside>
            </section>
          )}

          {selectedProduct &&
            (() => {
              const detailFlavours = getFlavourNames(selectedProduct);
              const detailPreferredFlavour = detailFlavours.includes(
                selectedFlavours[selectedProduct.id],
              )
                ? selectedFlavours[selectedProduct.id]
                : detailFlavours[0];
              const detailSelectedFlavour =
                getFlavourStock(selectedProduct, detailPreferredFlavour) > 0
                  ? detailPreferredFlavour
                  : getFirstInStockFlavour(
                      selectedProduct,
                      detailPreferredFlavour,
                    );
              const detailCartQuantity = cart
                .filter(
                  (item) =>
                    item.id === selectedProduct.id &&
                    item.selectedFlavour === detailSelectedFlavour,
                )
                .reduce((total, item) => total + item.quantity, 0);
              const detailStock = getFlavourStock(
                selectedProduct,
                detailSelectedFlavour,
              );
              const detailRemainingStock = Math.max(
                detailStock - detailCartQuantity,
                0,
              );
              const detailPrice = getFlavourPrice(
                selectedProduct,
                detailSelectedFlavour,
              );
              const isDetailSoldOut = detailRemainingStock <= 0;

              return (
                <section
                  aria-label={`${selectedProduct.name} details`}
                  className="product-detail-backdrop"
                  onClick={closeProductDetail}
                >
                  <article
                    aria-modal="true"
                    className="product-detail"
                    onClick={(event) => event.stopPropagation()}
                    role="dialog"
                  >
                    <button
                      aria-label="Close product details"
                      className="detail-close"
                      onClick={closeProductDetail}
                      type="button"
                    >
                      x
                    </button>

                    <div className="detail-image">
                      <img
                        src={selectedProduct.image}
                        alt={selectedProduct.name}
                      />
                      <span>{selectedProduct.tag}</span>
                    </div>

                    <div className="detail-content">
                      <p className="category">{selectedProduct.category}</p>
                      <h2>{selectedProduct.name}</h2>
                      <p className="detail-description">
                        {selectedProduct.description ||
                          "Choose a flavour and add this product to your cart."}
                      </p>

                      <div className="detail-stats">
                        <span>
                          <strong>{detailPrice}</strong>
                          Price
                        </span>
                      </div>

                      <label className="detail-flavour">
                        <span>Choose flavour</span>
                        <select
                          className="flavour-trigger"
                          onChange={(event) =>
                            setSelectedFlavours((currentFlavours) => ({
                              ...currentFlavours,
                              [selectedProduct.id]: event.target.value,
                            }))
                          }
                          value={detailSelectedFlavour}
                        >
                          {detailFlavours.map((flavour) => {
                            const hasNoStock =
                              getFlavourStock(selectedProduct, flavour) <= 0;

                            return (
                              <option
                                className={hasNoStock ? "no-stock-option" : ""}
                                disabled={hasNoStock}
                                key={flavour}
                                value={flavour}
                              >
                                {hasNoStock ? `${flavour} - No stock` : flavour}
                              </option>
                            );
                          })}
                        </select>
                      </label>

                      <div className="detail-actions">
                        <button
                          className="cart-button"
                          disabled={isDetailSoldOut}
                          onClick={() => {
                            addToCart(selectedProduct);
                            closeProductDetail();
                          }}
                          type="button"
                        >
                          {isDetailSoldOut ? "Sold Out" : "Add to Cart"}
                        </button>
                      </div>
                    </div>
                  </article>
                </section>
              );
            })()}
        </>
      )}
    </main>
  );
}
