import { useEffect, useMemo, useState } from "react";
import "./App.css";
import { products } from "./products";

const whatsappNumber = "601165302622";
const productsStorageKey = "summer-vibes-products";
const productsVersionStorageKey = "summer-vibes-products-version";
const productsVersion = "2026-05-18-spacebar-flavours";
const adminPasscode = "2622";
const adminSessionKey = "summer-vibes-admin";
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
    image,
    flavours,
  }) => ({
    id,
    name,
    category,
    price,
    rating,
    tag,
    image,
    flavours,
  }));
}

function mergeSavedProducts(savedProducts, fallbackProducts) {
  if (!Array.isArray(savedProducts)) {
    return fallbackProducts;
  }

  const mergedProducts = fallbackProducts.map((product) => {
    const savedProduct = savedProducts.find((item) => item.id === product.id);

    return savedProduct
      ? {
          ...product,
          name: savedProduct.name || product.name,
          category: savedProduct.category || product.category,
          price: savedProduct.price || product.price,
          rating: savedProduct.rating || product.rating,
          tag: savedProduct.tag || product.tag,
          image: savedProduct.image || product.image,
          flavours: normalizeFlavours(
            savedProduct.flavours,
            savedProduct.stock ?? product.stock,
          ),
        }
      : product;
  });

  const addedProducts = savedProducts
    .filter(
      (savedProduct) =>
        !fallbackProducts.some((product) => product.id === savedProduct.id),
    )
    .map((savedProduct) => ({
      id: savedProduct.id,
      name: savedProduct.name || "New product",
      category: savedProduct.category || "Disposable Vape",
      price: savedProduct.price || "RM0",
      rating: savedProduct.rating || "4.5",
      tag: savedProduct.tag || "New",
      image: savedProduct.image || defaultProductImage,
      flavours: normalizeFlavours(savedProduct.flavours),
    }));

  return [...mergedProducts, ...addedProducts];
}

function getInitialProducts() {
  const fallbackProducts = getFallbackProducts();

  try {
    const savedProductsVersion = window.localStorage.getItem(
      productsVersionStorageKey,
    );

    if (savedProductsVersion !== productsVersion) {
      window.localStorage.setItem(productsVersionStorageKey, productsVersion);
      return fallbackProducts;
    }

    const savedProducts = JSON.parse(
      window.localStorage.getItem(productsStorageKey),
    );

    return mergeSavedProducts(savedProducts, fallbackProducts);
  } catch {
    return fallbackProducts;
  }
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
  const [storeProducts, setStoreProducts] = useState(getInitialProducts);
  const [isRemoteSyncReady, setIsRemoteSyncReady] = useState(false);
  const [cart, setCart] = useState([]);
  const [selectedProductId, setSelectedProductId] = useState(null);
  const [adminSearch, setAdminSearch] = useState("");
  const [selectedFlavours, setSelectedFlavours] = useState(() =>
    Object.fromEntries(
      products.map((product) => [product.id, product.flavours[0]]),
    ),
  );

  useEffect(() => {
    let isMounted = true;

    async function loadRemoteProducts() {
      try {
        const response = await fetch(productsApiPath);

        if (response.status === 501) {
          return;
        }

        if (!response.ok) {
          throw new Error("Unable to load shared products");
        }

        const data = await response.json();

        if (Array.isArray(data.products) && isMounted) {
          setStoreProducts(
            mergeSavedProducts(data.products, getFallbackProducts()),
          );
        }

        if (isMounted) {
          setIsRemoteSyncReady(true);
        }
      } catch {
        if (isMounted) {
          setIsRemoteSyncReady(false);
        }
      }
    }

    loadRemoteProducts();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const serializedProducts = serializeProducts(storeProducts);

    window.localStorage.setItem(
      productsStorageKey,
      JSON.stringify(serializedProducts),
    );

    if (!isRemoteSyncReady) {
      return;
    }

    const saveTimeout = window.setTimeout(() => {
      fetch(productsApiPath, {
        body: JSON.stringify({ products: serializedProducts }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }).catch(() => {
        setIsRemoteSyncReady(false);
      });
    }, 500);

    return () => window.clearTimeout(saveTimeout);
  }, [isRemoteSyncReady, storeProducts]);

  useEffect(() => {
    function closeDetailWithEscape(event) {
      if (event.key === "Escape") {
        closeProductDetail();
      }
    }

    if (!selectedProductId) {
      return;
    }

    window.addEventListener("keydown", closeDetailWithEscape);

    return () => {
      window.removeEventListener("keydown", closeDetailWithEscape);
    };
  }, [selectedProductId]);

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

  function handleProductCardKeyDown(event, productId) {
    if (event.target !== event.currentTarget) {
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openProductDetail(productId);
    }
  }

  function updateProduct(productId, field, value) {
    setStoreProducts((currentProducts) =>
      currentProducts.map((product) =>
        product.id === productId ? { ...product, [field]: value } : product,
      ),
    );
  }

  function addProduct() {
    const nextProduct = {
      id: Date.now(),
      name: "New product",
      category: "Disposable Vape",
      price: "RM0",
      rating: "4.5",
      tag: "New",
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
      `Total: RM${cartTotal.toFixed(2)}`,
      "",
      "Name:",
      "Delivery / pickup:",
    ].join("\n");

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

  return (
    <main className={`store ${isAdminRoute ? "admin-store" : ""}`}>
      <nav className="store-nav" aria-label="Store sections">
        <strong>Summer Vibes</strong>
        <div>
          <button
            className={!isAdminRoute ? "active" : ""}
            onClick={() => {
              window.history.pushState({}, "", "/");
              window.location.reload();
            }}
            type="button"
          >
            Shop
          </button>
          <button
            className={isAdminRoute ? "active" : ""}
            onClick={() => {
              window.history.pushState({}, "", "/admin");
              window.location.reload();
            }}
            type="button"
          >
            Admin
          </button>
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
              <div>
                <button onClick={addProduct} type="button">
                  Add product
                </button>
                <button onClick={logoutAdmin} type="button">
                  Logout
                </button>
              </div>
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
              Showing {filteredAdminProducts.length} of {storeProducts.length}
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
                  className={`control-row ${isExpanded ? "expanded" : ""}`}
                  key={product.id}
                >
                  <button
                    className="control-card-summary"
                    onClick={() =>
                      setExpandedProductId(isExpanded ? null : product.id)
                    }
                    type="button"
                  >
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

          <section className="checkout-panel" aria-label="Checkout cart">
            <div>
              <p className="eyebrow">WhatsApp checkout</p>
              <h2>Your cart</h2>
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
              <strong>RM{cartTotal.toFixed(2)}</strong>
              <button
                className="checkout-button"
                disabled={cart.length === 0}
                onClick={checkoutWithWhatsApp}
                type="button"
              >
                Checkout with WhatsApp
              </button>
              {cart.length > 0 && (
                <button className="clear-button" onClick={clearCart} type="button">
                  Clear
                </button>
              )}
            </div>
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
                        <span>
                          <strong>{selectedProduct.rating}</strong>
                          Rating
                        </span>
                        <span>
                          <strong>{selectedProduct.nicotine || "-"}</strong>
                          Nicotine
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
                        <p>{detailRemainingStock} left</p>
                        <button
                          className="cart-button"
                          disabled={isDetailSoldOut}
                          onClick={() => addToCart(selectedProduct)}
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
