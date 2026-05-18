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

function getInitialProducts() {
  const fallbackProducts = products.map((product) => ({
    ...product,
    flavours: normalizeFlavours(product.flavours, product.stock),
  }));

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
  const [cart, setCart] = useState([]);
  const [selectedFlavours, setSelectedFlavours] = useState(() =>
    Object.fromEntries(
      products.map((product) => [product.id, product.flavours[0]]),
    ),
  );

  useEffect(() => {
    window.localStorage.setItem(
      productsStorageKey,
      JSON.stringify(
        storeProducts.map(({
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
        })),
      ),
    );
  }, [storeProducts]);

  const productById = useMemo(
    () => new Map(storeProducts.map((product) => [product.id, product])),
    [storeProducts],
  );

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
    <main className="store">
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
              <p className="eyebrow">Control page</p>
              <h1>Edit products</h1>
            </div>
            <div className="control-header-actions">
              <p>
                Change product names and set quantities for each flavour. Updates
                save automatically.
              </p>
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

          <div className="control-list">
            {storeProducts.map((product) => {
              const totalStock = getTotalStock(product);
              const isExpanded = expandedProductId === product.id;

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
                      <small>{product.flavours.length} flavours</small>
                    </span>
                    <strong className={totalStock > 0 ? "in-stock" : "out-stock"}>
                      {totalStock > 0 ? `${totalStock} total` : "Out of stock"}
                    </strong>
                    <em>{isExpanded ? "Close" : "Edit"}</em>
                  </button>

                  {isExpanded && (
                    <div className="control-card-editor">
                      <label>
                        <span>Product name</span>
                        <input
                          onChange={(event) =>
                            updateProduct(product.id, "name", event.target.value)
                          }
                          value={product.name}
                        />
                      </label>
                      <label>
                        <span>Price</span>
                        <input
                          onChange={(event) =>
                            updateProduct(product.id, "price", event.target.value)
                          }
                          placeholder="RM42"
                          value={product.price}
                        />
                      </label>
                      <label>
                        <span>Image URL</span>
                        <input
                          onChange={(event) =>
                            updateProduct(product.id, "image", event.target.value)
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
          </div>
        </section>
        )
      ) : (
        <>
          <section className="store-hero">
            <div>
              <p className="eyebrow">Adult vape products only</p>
              <h1>Summer Vibes Vape</h1>
              <p className="hero-copy">
                Curated disposable vapes, pod systems, and e-liquids with clear
                flavour choices, simple pricing, and a cleaner shopping experience.
              </p>
              <p className="age-note">For adults 18+ only. Keep away from children.</p>
            </div>

            <button className="hero-button">Shop Vapes</button>
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
                <article className="product-card" key={product.id}>
                  <div className="image-wrap">
                    <img src={product.image} alt={product.name} />
                    <span>{product.tag}</span>
                  </div>

                  <div className="product-info">
                    <p className="category">{product.category}</p>
                    <h3>{product.name}</h3>
                    <div className="flavour-select">
                      <span>Choose flavour</span>
                      <label className="flavour-dropdown">
                        <span className="sr-only">
                          Choose flavour for {product.name}
                        </span>
                        <select
                          className="flavour-trigger"
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
                  </div>

                  <button
                    className="cart-button"
                    disabled={isSoldOut}
                    onClick={() => addToCart(product)}
                    type="button"
                  >
                    {isSoldOut ? "Sold Out" : "Add to Cart"}
                  </button>
                </article>
              );
            })}
          </section>
        </>
      )}
    </main>
  );
}
