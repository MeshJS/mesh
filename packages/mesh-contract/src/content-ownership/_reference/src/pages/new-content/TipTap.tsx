"use client";

import Placeholder from "@tiptap/extension-placeholder";
import { useEditor, EditorContent, BubbleMenu, Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Code, Italic, Strikethrough } from "lucide-react";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { createLowlight, common } from "lowlight";

const Tiptap = ({editor}:{editor:Editor | null}) => {
//   const lowlight = createLowlight(common);
  

  return (
    <>
      {editor && (
        <BubbleMenu
          editor={editor}
          tippyOptions={{ duration: 100 }}
          className=" space-x-1"
        >
          <button
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={
              '  rounded-md p-1${editor.isActive("bold") ? " bg-black" :" bg-gray-500"}'
            }
          >
            <Bold />
          </button>
          <button
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={
              '  rounded-md p-1${editor.isActive("italic") ? " bg-black" :" bg-gray-500"}'
            }
          >
            <Italic />
          </button>
          <button
            onClick={() => editor.chain().focus().toggleStrike().run()}
            className={
              '  rounded-md p-1${editor.isActive("strike") ? " bg-black" :" bg-gray-500"}'
            }
          >
            <Strikethrough />
          </button>
          {/* <button
            onClick={() => editor.chain().focus().toggleCode().run()}
            className={' rounded-md p-1 ${editor.isActive("strike") ? " bg-black" :" bg-gray-500"}'}
          >
            <Code/>
          </button> */}
        </BubbleMenu>
      )}
      <EditorContent editor={editor} />
    </>
  );
};

export default Tiptap;
