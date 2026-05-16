import { useMemo, useState } from "react";
import "./App.css";
import { products } from "./products";

const whatsappNumber = "601165302622";

export default function App() {
  const [cart, setCart] = useState([]);
  const [selectedFlavours, setSelectedFlavours] = useState(() =>
    Object.fromEntries(products.map((product) => [product.id, product.flavours[0]])),
  );

  const cartTotal = useMemo(
    () =>
      cart.reduce((total, item) => {
        const price = Number(item.price.replace(/[^0-9.]/g, ""));
        return total + price * item.quantity;
      }, 0),
    [cart],
  );

  const cartCount = cart.reduce((total, item) => total + item.quantity, 0);

  function addToCart(product, flavour) {
    const selectedFlavour =
      flavour || selectedFlavours[product.id] || product.flavours[0];
    const cartId = `${product.id}-${selectedFlavour}`;

    setCart((currentCart) => {
      const existingItem = currentCart.find((item) => item.cartId === cartId);

      if (existingItem) {
        return currentCart.map((item) =>
          item.cartId === cartId
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        );
      }

      return [
        ...currentCart,
        { ...product, cartId, selectedFlavour, quantity: 1 },
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

  function checkoutWithWhatsApp() {
    const orderLines = cart.map(
      (item) =>
        `- ${item.name} x${item.quantity} (${item.price}) | Flavour: ${item.selectedFlavour}`,
    );

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

  return (
    <main className="store">
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
          {products.length} products available {" · "}
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
              <div className="cart-item" key={item.cartId}>
                <div>
                  <strong>{item.name}</strong>
                  <span>
                    {item.selectedFlavour} {" · "}
                    {item.price} {" · "} Qty {item.quantity}
                  </span>
                </div>
                <div className="quantity-controls">
                  <button onClick={() => removeFromCart(item.cartId)} type="button">
                    -
                  </button>
                  <span>{item.quantity}</span>
                  <button
                    onClick={() => addToCart(item, item.selectedFlavour)}
                    type="button"
                  >
                    +
                  </button>
                </div>
              </div>
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
        {products.map((product) => (
          <article className="product-card" key={product.id}>
            <div className="image-wrap">
              <img src={product.image} alt={product.name} />
              <span>{product.tag}</span>
            </div>

            <div className="product-info">
              <p className="category">{product.category}</p>
              <h3>{product.name}</h3>
              <label className="flavour-select">
                <span>Choose flavour</span>
                <select
                  onChange={(event) =>
                    setSelectedFlavours((currentFlavours) => ({
                      ...currentFlavours,
                      [product.id]: event.target.value,
                    }))
                  }
                  value={selectedFlavours[product.id] || product.flavours[0]}
                >
                  {product.flavours.map((flavour) => (
                    <option key={flavour} value={flavour}>
                      {flavour}
                    </option>
                  ))}
                </select>
              </label>
              <div className="product-meta">
                <strong>{product.price}</strong>
                <span>{product.rating} / 5.0</span>
              </div>
            </div>

            <button
              className="cart-button"
              onClick={() => addToCart(product)}
              type="button"
            >
              Add to Cart
            </button>
          </article>
        ))}
      </section>
    </main>
  );
}
