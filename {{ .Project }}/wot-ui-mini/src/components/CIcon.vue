<script setup lang="ts">
import { computed } from 'vue';
import { iconSource } from './icon-source';
const props=defineProps<{name:string;tone?:string;variant?:string;dark?:boolean;accent?:string}>();
const source=computed(()=>iconSource(props));
</script><template><image class="cinch-icon" :src="source" mode="aspectFit" aria-hidden="true" /></template>
<style>.cinch-icon{display:block;flex-shrink:0;width:var(--icon-size,20px);height:var(--icon-size,20px)}</style>
