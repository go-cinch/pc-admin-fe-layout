<script setup lang="ts">
defineProps<{name:string}>();
const names:Record<string,string>={"users": "user-group", "shield": "safe", "grid": "apps", "key": "lock", "book": "book", "check": "check", "bell": "notification", "home": "home", "user": "user", "back": "arrow-left", "more": "more", "search": "search-line", "refresh": "refresh", "density": "unordered-list", "columns": "layout", "chevron": "arrow-right", "close": "close", "moon": "moon", "globe": "application", "settings": "settings"};
</script><template><wd-icon :name="names[name]||'app'" size="22px" /></template>
