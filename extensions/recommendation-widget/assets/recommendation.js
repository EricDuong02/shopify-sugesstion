(function () {
  "use strict";

  var pageTypes = {
    index: "home",
    product: "product",
    collection: "collection",
    cart: "cart",
  };

  function productUrl(product) {
    if (product.url) {
      try {
        var url = new URL(product.url, window.location.origin);
        if (url.protocol === "https:" || url.protocol === "http:") {
          return url.href;
        }
      } catch (error) {
        return "";
      }
    }

    if (product.handle) {
      return "/products/" + encodeURIComponent(product.handle);
    }

    return "";
  }

  function render(root, data) {
    root.replaceChildren();

    var heading = root.getAttribute("data-heading");
    if (heading) {
      var headingElement = document.createElement("h2");
      headingElement.className = "recommendation-widget__heading";
      headingElement.textContent = heading;
      root.appendChild(headingElement);
    }

    var grid = document.createElement("div");
    grid.className = "recommendation-widget__grid";

    data.products.forEach(function (product) {
      var link = productUrl(product);
      if (!link) return;

      var card = document.createElement("a");
      card.className = "recommendation-widget__card";
      card.href = link;

      if (product.avatarSource) {
        var image = document.createElement("img");
        image.className = "recommendation-widget__image";
        image.src = product.avatarSource;
        image.alt = product.name || "";
        image.loading = "lazy";
        card.appendChild(image);
      }

      var details = document.createElement("div");
      details.className = "recommendation-widget__details";

      var title = document.createElement("p");
      title.className = "recommendation-widget__title";
      title.textContent = product.name || "Product";
      details.appendChild(title);

      if (product.price !== null && product.price !== undefined) {
        var price = document.createElement("p");
        price.className = "recommendation-widget__price";
        price.textContent = String(product.price);
        details.appendChild(price);
      }

      card.appendChild(details);
      grid.appendChild(card);
    });

    if (!grid.childElementCount) {
      root.hidden = true;
      return;
    }

    root.appendChild(grid);
    root.hidden = false;
  }

  function load(root) {
    if (root.dataset.recommendationInitialized === "true") return;
    root.dataset.recommendationInitialized = "true";

    var campaignId = (root.getAttribute("data-recommendation-id") || "").trim();
    var pageType = pageTypes[root.getAttribute("data-page-type") || ""];
    var columns = Number(root.getAttribute("data-columns"));
    if (Number.isInteger(columns) && columns > 0) {
      root.style.setProperty("--recommendation-columns", String(columns));
    }
    if (!campaignId || !pageType) {
      root.hidden = true;
      return;
    }

    var params = new URLSearchParams({
      id: campaignId,
      pageType: pageType,
      limit: root.getAttribute("data-limit") || "8",
    });

    fetch("/apps/recommendations?" + params.toString(), {
      headers: { Accept: "application/json" },
    })
      .then(function (response) {
        if (!response.ok) throw new Error("recommendation request failed");
        return response.json();
      })
      .then(function (data) {
        if (!data || !Array.isArray(data.products) || !data.products.length) {
          root.hidden = true;
          return;
        }
        render(root, data);
      })
      .catch(function () {
        root.hidden = true;
      });
  }

  function init() {
    document
      .querySelectorAll(".recommendation-widget")
      .forEach(function (root) {
        load(root);
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  document.addEventListener("shopify:section:load", init);
})();
