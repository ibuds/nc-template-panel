// Open the side panel when the toolbar icon is clicked.
// Handling the click ourselves (instead of setPanelBehavior) means every click
// also grants `activeTab` for that tab, which covers sites not in the Sites list.
// The panel is opened for the whole window so it stays open when staff switch tabs.
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
});
