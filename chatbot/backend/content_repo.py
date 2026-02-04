# コンテンツリポジトリ
# contents.json の読み込みと参照整合性チェック

import json
import logging
from pathlib import Path
from typing import Dict, List, Optional, Any

from config import config

logger = logging.getLogger(__name__)


class ContentValidationError(Exception):
    """コンテンツ検証エラー"""
    pass


class ContentRepository:
    """コンテンツリポジトリ"""
    
    def __init__(self, content_path: str = None):
        self.content_path = Path(content_path or config.CONTENT_PATH)
        self._data: Dict[str, Any] = {}
        self._loaded = False
    
    def load(self) -> None:
        """コンテンツを読み込み、検証する"""
        if not self.content_path.exists():
            raise ContentValidationError(f"Content file not found: {self.content_path}")
        
        with open(self.content_path, "r", encoding="utf-8") as f:
            self._data = json.load(f)
        
        self._validate()
        self._loaded = True
        logger.info(f"Loaded contents from {self.content_path}")
    
    def _validate(self) -> None:
        """参照整合性チェック"""
        errors = []
        
        # 必須セクションチェック
        required = ["screen_registry", "menus", "content_items", "system_messages"]
        for key in required:
            if key not in self._data:
                errors.append(f"Missing required section: {key}")
        
        if errors:
            raise ContentValidationError("\n".join(errors))
        
        # screen_registry の検証
        valid_screens = set(self._data["screen_registry"].keys())
        valid_screens.add("global")  # フォールバック用
        
        # menus の参照検証
        valid_menus = set(self._data["menus"].keys())
        for menu_id, menu in self._data["menus"].items():
            for opt in menu.get("options", []):
                next_state = opt.get("next_state", "")
                if next_state.startswith("home:"):
                    screen = next_state.split(":")[1]
                    if screen not in valid_screens:
                        errors.append(f"Menu '{menu_id}' references unknown screen: {screen}")
                elif next_state.startswith("menu:"):
                    ref_menu = next_state[5:]  # "menu:" を除去
                    if f"menu:{ref_menu}" not in valid_menus and ref_menu not in valid_menus:
                        errors.append(f"Menu '{menu_id}' references unknown menu: {next_state}")
                elif next_state.startswith("ans:"):
                    content_id = next_state[4:]  # "ans:" を除去
                    if content_id not in self._data["content_items"]:
                        errors.append(f"Menu '{menu_id}' references unknown content: {content_id}")
        
        # content_items の検証
        for item_id, item in self._data["content_items"].items():
            if not item.get("title"):
                errors.append(f"Content '{item_id}' missing title")
            if not item.get("body"):
                errors.append(f"Content '{item_id}' missing body")
        
        if errors:
            raise ContentValidationError("Validation errors:\n" + "\n".join(errors))
        
        logger.info("Content validation passed")
    
    def _ensure_loaded(self) -> None:
        if not self._loaded:
            self.load()
    
    # === Screen Registry ===
    
    def get_screen(self, screen_id: str) -> Optional[Dict[str, Any]]:
        """画面情報を取得"""
        self._ensure_loaded()
        return self._data["screen_registry"].get(screen_id)
    
    def get_valid_screens(self) -> List[str]:
        """有効な画面ID一覧"""
        self._ensure_loaded()
        return list(self._data["screen_registry"].keys())
    
    def resolve_screen_id(self, screen_id: str) -> str:
        """screen_id を検証し、不明なら global にフォールバック"""
        self._ensure_loaded()
        if screen_id in self._data["screen_registry"]:
            return screen_id
        logger.warning(f"Unknown screen_id: {screen_id}, falling back to 'global'")
        return "global"
    
    # === Menus ===
    
    def get_menu(self, menu_id: str) -> Optional[Dict[str, Any]]:
        """メニューを取得"""
        self._ensure_loaded()
        return self._data["menus"].get(menu_id)
    
    def get_home_menu(self, screen_id: str) -> Optional[Dict[str, Any]]:
        """画面のホームメニューを取得"""
        self._ensure_loaded()
        home_key = f"home:{screen_id}"
        return self._data["menus"].get(home_key)
    
    # === Content Items ===
    
    def get_content(self, content_id: str) -> Optional[Dict[str, Any]]:
        """コンテンツを取得"""
        self._ensure_loaded()
        return self._data["content_items"].get(content_id)
    
    def get_contents_by_screen(self, screen_id: str) -> List[Dict[str, Any]]:
        """画面に関連するコンテンツ一覧"""
        self._ensure_loaded()
        result = []
        for item_id, item in self._data["content_items"].items():
            screens = item.get("screens", [])
            if not screens or screen_id in screens:
                result.append({"id": item_id, **item})
        return result
    
    def get_all_contents(self) -> Dict[str, Dict[str, Any]]:
        """全コンテンツを取得"""
        self._ensure_loaded()
        return self._data["content_items"]
    
    # === System Messages ===
    
    def get_system_message(self, key: str) -> str:
        """システムメッセージを取得"""
        self._ensure_loaded()
        return self._data["system_messages"].get(key, "")
    
    # === Search Config ===
    
    def get_search_config(self) -> Dict[str, Any]:
        """検索設定を取得"""
        self._ensure_loaded()
        return self._data.get("search_config", {
            "enabled": True,
            "min_query_length": 2,
            "max_results": 5,
            "synonyms": {},
            "stopwords": []
        })


# シングルトンインスタンス
content_repo = ContentRepository()
