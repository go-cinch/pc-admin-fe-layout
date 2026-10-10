<script setup lang="ts">
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import CinchScreen from '../../../components/CinchScreen.vue';
const query=ref<Record<string,string>>({});
onLoad((options:any)=>{query.value=options||{}});
</script>
<template><CinchScreen route="/system/role" :query="query" /></template>
