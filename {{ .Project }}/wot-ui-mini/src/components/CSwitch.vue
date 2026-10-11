<script setup lang="ts">
const props=defineProps<{name:string;checked:any}>();const emit=defineEmits<{change:[value:{name:string;value:boolean}]}>();
</script><template><view class="switch-control" role="switch" aria-role="switch" :aria-checked="!!checked" :data-state="checked ? 'checked' : 'unchecked'"><wd-switch :model-value="!!checked" @update:model-value="(value:any)=>emit('change',{name:props.name,value:!!value})" /></view></template>
