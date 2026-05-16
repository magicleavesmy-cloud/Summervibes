export default function App() {
  const products = [
    {
      id: 1,
      name: "Nike Shoes",
      price: "RM299",
      image:
        "https://images.unsplash.com/photo-1542291026-7eec264c27ff",
    },
    {
      id: 2,
      name: "Smart Watch",
      price: "RM499",
      image:
        "https://images.unsplash.com/photo-1523275335684-37898b6baf30",
    },
  ];

  return (
    <div style={{ padding: 20 }}>
      <h1>My Ecommerce Store</h1>

      <div style={{ display: "flex", gap: 20 }}>
        {products.map((product) => (
          <div
            key={product.id}
            style={{
              border: "1px solid #ddd",
              padding: 10,
              width: 250,
            }}
          >
            <img
              src={product.image}
              alt={product.name}
              style={{
                width: "100%",
                height: 200,
                objectFit: "cover",
              }}
            />

            <h2>{product.name}</h2>

            <p>{product.price}</p>

            <button>Add to Cart</button>
          </div>
        ))}
      </div>
    </div>
  );
}