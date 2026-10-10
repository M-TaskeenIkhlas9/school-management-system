const navItems = document.querySelectorAll(".nav-item");
const sections = document.querySelectorAll(".section");
const sidebar = document.getElementById("sidebar");
const collapseBtn = document.getElementById("collapseBtn");

navItems.forEach((item) => {
  item.addEventListener("click", () => {
    navItems.forEach((button) => button.classList.remove("active"));
    item.classList.add("active");

    const targetId = item.dataset.section;
    sections.forEach((section) => {
      section.classList.toggle("active", section.id === targetId);
    });
  });
});

collapseBtn.addEventListener("click", () => {
  sidebar.classList.toggle("collapsed");
});

