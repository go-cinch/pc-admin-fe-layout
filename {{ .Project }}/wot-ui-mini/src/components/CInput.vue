<script setup lang="ts">
const props=defineProps<{name:string;value:any;label?:string;placeholder?:string;password?:boolean;disabled?:boolean}>();
const emit=defineEmits<{change:[value:{name:string;value:any}];blur:[value:{name:string}];focus:[value:{name:string}]}>();
function change(value:any){emit('change',{name:props.name,value})}
</script><template><view class="c-input"><wd-input :model-value="value" :aria-label="label" :placeholder="placeholder" :disabled="disabled" :show-password="password" type="text" :maxlength="-1" @update:model-value="change" @blur="emit('blur',{name:props.name})" @focus="emit('focus',{name:props.name})" /></view></template>
