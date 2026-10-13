(function () {
  "use strict";

  var pageTypes = {
    index: "home",
    product: "product",
    collection: "collection",
    cart: "cart",
  };
  var desktopColumnLimit = 6;
  var mobileColumnLimit = 3;
  var defaultDesktopColumns = 4;
  var defaultMobileColumns = 1;
  var defaultProductLimit = "8";
  var desktopBreakpoint = 750;
  var slideGap = 16;

  function safeHttpUrl(value) {
    if (!value) return "";

    try {
      var url = new URL(value, window.location.origin);
      if (url.protocol === "https:" || url.protocol === "http:") {
        return url.href;
      }
    } catch (error) {
      return "";
    }

    return "";
  }

  function productUrl(product) {
    var url = safeHttpUrl(product.url);
    if (url) return url;

    if (product.handle) {
      return "/products/" + encodeURIComponent(product.handle);
    }

    return "";
  }

  function imageUrl(product) {
    return safeHttpUrl(product.avatarSource);
  }

  function validColumns(value, maximum, fallback) {
    var columns = Number(value);
    if (!Number.isInteger(columns) || columns < 1) return fallback;
    return Math.min(columns, maximum);
  }

  function createButton(className, label) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.setAttribute("aria-label", label);
    return button;
  }

  function prefersReducedMotion() {
    return (
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }

  function updateControls(track, previousButton, nextButton) {
    var hasOverflow = track.scrollWidth > track.clientWidth + 1;
    previousButton.hidden = !hasOverflow;
    nextButton.hidden = !hasOverflow;
    previousButton.disabled = !hasOverflow || track.scrollLeft <= 1;
    nextButton.disabled =
      !hasOverflow ||
      track.scrollLeft + track.clientWidth >= track.scrollWidth - 1;
  }

  function renderProduct(track, product) {
    var link = productUrl(product);
    if (!link) return;

    var card = document.createElement("a");
    card.className = "recommendation-widget__card";
    card.href = link;

    var image = imageUrl(product);
    if (image) {
      var imageElement = document.createElement("img");
      imageElement.className = "recommendation-widget__image";
      imageElement.src = image;
      imageElement.alt = product.name || "";
      imageElement.loading = "lazy";
      card.appendChild(imageElement);
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

    var slide = document.createElement("li");
    slide.className = "recommendation-widget__slide swiper-slide";
    slide.appendChild(card);
    track.appendChild(slide);
  }

  function renderCampaign(root, campaign, columns, mobileColumns) {
    if (!campaign || !Array.isArray(campaign.products)) return null;

    var products = campaign.products;
    var section = document.createElement("section");
    section.className = "recommendation-widget__campaign";
    section.setAttribute(
      "aria-label",
      campaign.name || root.getAttribute("data-heading") || "Recommendations"
    );

    if (campaign.name) {
      var campaignHeading = document.createElement("h3");
      campaignHeading.className = "recommendation-widget__campaign-heading";
      campaignHeading.textContent = campaign.name;
      section.appendChild(campaignHeading);
    }

    var carousel = document.createElement("div");
    carousel.className = "recommendation-widget__carousel swiper";
    carousel.style.setProperty("--recommendation-columns", String(columns));
    carousel.style.setProperty(
      "--recommendation-mobile-columns",
      String(mobileColumns)
    );

    var track = document.createElement("ul");
    track.className = "recommendation-widget__track swiper-wrapper";
    track.setAttribute("aria-label", campaign.name || "Recommended products");

    products.forEach(function (product) {
      renderProduct(track, product);
    });

    if (!track.childElementCount) return null;

    var previousButton = createButton(
      "recommendation-widget__previous",
      root.getAttribute("data-previous-label") || "Previous products"
    );
    var nextButton = createButton(
      "recommendation-widget__next",
      root.getAttribute("data-next-label") || "Next products"
    );
    previousButton.textContent = "‹";
    nextButton.textContent = "›";

    function scrollTrack(direction) {
      track.scrollBy({
        behavior: prefersReducedMotion() ? "auto" : "smooth",
        left: direction * track.clientWidth,
      });
    }

    carousel.appendChild(previousButton);
    carousel.appendChild(track);
    carousel.appendChild(nextButton);
    section.appendChild(carousel);
    root.appendChild(section);

    var swiper = null;
    if (window.Swiper) {
      carousel.classList.add("recommendation-widget__swiper-ready");
      swiper = new window.Swiper(carousel, {
        a11y: { enabled: true },
        breakpoints: {
          [desktopBreakpoint]: { slidesPerView: columns },
        },
        grabCursor: true,
        keyboard: { enabled: true },
        navigation: {
          nextEl: nextButton,
          prevEl: previousButton,
        },
        slidesPerGroup: 1,
        slidesPerView: mobileColumns,
        spaceBetween: slideGap,
        watchOverflow: true,
      });
    }

    function update() {
      if (!swiper) {
        updateControls(track, previousButton, nextButton);
        return;
      }

      var locked = swiper.isLocked === true;
      previousButton.hidden = locked;
      nextButton.hidden = locked;
      previousButton.disabled = locked || swiper.isBeginning;
      nextButton.disabled = locked || swiper.isEnd;
    }

    function onPrevious() {
      scrollTrack(-1);
    }

    function onNext() {
      scrollTrack(1);
    }

    if (!swiper) {
      previousButton.addEventListener("click", onPrevious);
      nextButton.addEventListener("click", onNext);
      track.addEventListener("scroll", update, { passive: true });
      window.addEventListener("resize", update);
    } else {
      swiper.on("afterInit", update);
      swiper.on("breakpoint", update);
      swiper.on("resize", update);
      swiper.on("slideChange", update);
      swiper.on("update", update);
    }

    update();

    return function cleanup() {
      if (swiper) {
        swiper.destroy(true, true);
        return;
      }
      previousButton.removeEventListener("click", onPrevious);
      nextButton.removeEventListener("click", onNext);
      track.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }

  function render(root, data) {
    if (root.__recommendationCleanup) root.__recommendationCleanup();
    root.__recommendationCleanup = null;
    root.replaceChildren();

    var heading = root.getAttribute("data-heading");
    if (heading) {
      var headingElement = document.createElement("h2");
      headingElement.className = "recommendation-widget__heading";
      headingElement.textContent = heading;
      root.appendChild(headingElement);
    }

    var campaigns = Array.isArray(data.campaigns)
      ? data.campaigns
      : data.products
        ? [data]
        : [];
    var columns = validColumns(
      root.getAttribute("data-columns"),
      desktopColumnLimit,
      defaultDesktopColumns
    );
    var mobileColumns = validColumns(
      root.getAttribute("data-mobile-columns"),
      mobileColumnLimit,
      defaultMobileColumns
    );
    var cleanups = [];

    campaigns.forEach(function (campaign) {
      var cleanup = renderCampaign(root, campaign, columns, mobileColumns);
      if (cleanup) cleanups.push(cleanup);
    });

    if (!cleanups.length) {
      root.hidden = true;
      return;
    }

    root.__recommendationCleanup = function () {
      cleanups.forEach(function (cleanup) {
        cleanup();
      });
    };
    root.hidden = false;
  }

  function requestKey(path, params) {
    return path + "?" + params.toString();
  }

  function getRequest(path, params) {
    var requestStore = window.__recommendationRequests;
    if (!requestStore) {
      requestStore = {};
      window.__recommendationRequests = requestStore;
    }

    var key = requestKey(path, params);
    if (requestStore[key]) return requestStore[key];

    var request = fetch(path + "?" + params.toString(), {
      headers: { Accept: "application/json" },
    }).then(function (response) {
      if (!response.ok) throw new Error("recommendation request failed");
      return response.json();
    });

    requestStore[key] = request;
    request.then(
      function () {
        if (requestStore[key] === request) delete requestStore[key];
      },
      function () {
        if (requestStore[key] === request) delete requestStore[key];
      }
    );
    return request;
  }

  function load(root) {
    if (root.dataset.recommendationInitialized === "true") return;
    root.dataset.recommendationInitialized = "true";

    var campaignId = (root.getAttribute("data-recommendation-id") || "").trim();
    var pageType = pageTypes[root.getAttribute("data-page-type") || ""];
    if (!pageType) {
      root.hidden = true;
      return;
    }

    var params = new URLSearchParams({
      pageType: pageType,
    });
    var productLimit = root.getAttribute("data-limit") || defaultProductLimit;
    if (campaignId) {
      params.set("id", campaignId);
      params.set("limit", productLimit);
    } else {
      params.set("productLimit", productLimit);
    }

    getRequest("/apps/recommendations", params)
      .then(function (data) {
        render(root, data);
      })
      .catch(function () {
        root.hidden = true;
      });
  }

  function init(scope) {
    (scope || document)
      .querySelectorAll(".recommendation-widget")
      .forEach(function (root) {
        load(root);
      });
  }

  function unload(scope) {
    (scope || document)
      .querySelectorAll(".recommendation-widget")
      .forEach(function (root) {
        if (root.__recommendationCleanup) root.__recommendationCleanup();
        root.__recommendationCleanup = null;
        root.dataset.recommendationInitialized = "false";
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      init();
    });
  } else {
    init();
  }

  document.addEventListener("shopify:section:load", function (event) {
    init(event.target);
  });
  document.addEventListener("shopify:section:unload", function (event) {
    unload(event.target);
  });
})();
