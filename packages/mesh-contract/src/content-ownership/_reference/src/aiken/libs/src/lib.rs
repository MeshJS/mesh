use cardano_serialization_lib::{
    error::JsError,
    plutus::{PlutusList, PlutusScript},
};

#[cfg(not(all(target_arch = "wasm32", not(target_os = "emscripten"))))]
use noop_proc_macro::wasm_bindgen;

#[cfg(all(target_arch = "wasm32", not(target_os = "emscripten")))]
use wasm_bindgen::prelude::{wasm_bindgen, JsValue};

#[wasm_bindgen]
pub fn apply_params_to_plutus_script(
    params: &PlutusList,
    plutus_script: PlutusScript,
) -> Result<PlutusScript, JsError> {
    match uplc::tx::apply_params_to_script(&params.to_bytes(), &plutus_script.bytes()) {
        Ok(res) => Ok(PlutusScript::new(res)),
        Err(err) => Err(JsError::from_str(&err.to_string())),
    }
}
